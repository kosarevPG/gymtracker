"""
YDB хранилище для GymTracker.
Таблицы: exercises, log (подходы).
Переменные окружения: YDB_ENDPOINT, YDB_DATABASE.
Для Yandex Cloud Function: YDB_METADATA_CREDENTIALS=1 или service account key.
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

MOSCOW_TZ = timezone(timedelta(hours=3))
DEFAULT_GROUPS = ['Спина', 'Ноги', 'Грудь', 'Плечи', 'Трицепс', 'Бицепс', 'Пресс', 'Кардио']

_driver = None
_pool = None


def _get_credentials():
    """Credentials для Yandex Cloud: metadata или service account key."""
    import ydb
    if os.environ.get('YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS'):
        return ydb.iam.ServiceAccountCredentials.from_file(
            os.environ['YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS']
        )
    if os.environ.get('YDB_METADATA_CREDENTIALS') == '1':
        return ydb.iam.MetadataUrlCredentials()
    return ydb.credentials_from_env_variables()


def get_pool():
    """Возвращает пул сессий YDB или None если не настроен."""
    global _driver, _pool
    if _pool is not None:
        return _pool
    endpoint = os.environ.get('YDB_ENDPOINT', '')
    database = os.environ.get('YDB_DATABASE', '')
    if not endpoint or not database:
        return None
    try:
        import ydb
        _driver = ydb.Driver(
            endpoint=endpoint,
            database=database,
            credentials=_get_credentials(),
        )
        _driver.wait(timeout=5, fail_fast=True)
        _pool = ydb.QuerySessionPool(_driver)
        _ensure_tables(_pool)
        return _pool
    except Exception as e:
        logger.error(f"YDB init failed: {e}", exc_info=True)
        return None


def _ensure_tables(pool) -> None:
    """Создаёт таблицы если не существуют."""
    pool.execute_with_retries("""
        CREATE TABLE IF NOT EXISTS exercises (
            id Utf8,
            name Utf8,
            muscle_group Utf8,
            description Utf8,
            image_url Utf8,
            image_url2 Utf8,
            equipment_type Utf8,
            exercise_type Utf8,
            weight_type Utf8,
            base_weight Double,
            multiplier Uint32,
            PRIMARY KEY (id)
        );
    """)
    pool.execute_with_retries("""
        CREATE TABLE IF NOT EXISTS log (
            id Utf8,
            date Utf8,
            exercise_id Utf8,
            exercise_name Utf8,
            input_weight Double,
            total_weight Double,
            reps Uint32,
            rest Double,
            set_group_id Utf8,
            note Utf8,
            ord Uint32,
            PRIMARY KEY (id)
        );
    """)


def _to_float(v, default=0.0) -> float:
    if v is None: return default
    try:
        return float(str(v).replace(',', '.').strip() or 0)
    except (ValueError, TypeError):
        return default


def _to_int(v, default=0) -> int:
    try:
        return int(_to_float(v, default))
    except (ValueError, TypeError):
        return default


def _row_val(row, *keys, default=''):
    """Берёт значение из row по первому найденному ключу (поддержка разных схем)."""
    for k in keys:
        try:
            v = getattr(row, k, None)
            if v is not None:
                return v
        except (AttributeError, KeyError):
            pass
    return default


# --- Exercises ---

def get_all_exercises() -> Dict:
    """Возвращает {groups: [...], exercises: [...]}. Поддерживает разные схемы колонок."""
    pool = get_pool()
    if not pool:
        return {"groups": DEFAULT_GROUPS, "exercises": []}
    try:
        result_sets = pool.execute_with_retries("SELECT * FROM exercises ORDER BY name;")
        exercises = []
        groups = set()
        for row in result_sets[0].rows:
            ex_id = _row_val(row, 'id', 'ID')
            name = _row_val(row, 'name', 'Name')
            muscle = _row_val(row, 'muscle_group', 'muscleGroup', 'Muscle_Group', 'Muscle Group')
            ex = {
                'id': str(ex_id),
                'name': str(name),
                'muscleGroup': str(muscle) if muscle else '',
                'description': str(_row_val(row, 'description', 'Description', 'desc')) or '',
                'imageUrl': str(_row_val(row, 'image_url', 'imageUrl', 'Image_URL')) or '',
                'imageUrl2': str(_row_val(row, 'image_url2', 'imageUrl2', 'Image_URL2')) or '',
                'equipmentType': str(_row_val(row, 'equipment_type', 'equipmentType', 'Equipment_Type')) or 'barbell',
                'exerciseType': str(_row_val(row, 'exercise_type', 'exerciseType', 'Exercise_Type')) or 'compound',
                'weightType': str(_row_val(row, 'weight_type', 'weightType', 'Weight_Type')) or 'Barbell',
                'baseWeight': _to_float(_row_val(row, 'base_weight', 'baseWeight', 'Base_Wt')),
                'weightMultiplier': _to_int(_row_val(row, 'weight_multiplier', 'weightMultiplier', 'Multiplier', 'multiplier'), 1),
            }
            ex['allow_1rm'] = ex['weightType'] not in ('Assisted', 'Bodyweight')
            if ex['muscleGroup']:
                groups.add(ex['muscleGroup'])
            exercises.append(ex)
        groups_list = sorted(groups) if groups else DEFAULT_GROUPS
        return {"groups": groups_list, "exercises": exercises}
    except Exception as e:
        logger.error(f"get_all_exercises: {e}", exc_info=True)
        return {"groups": DEFAULT_GROUPS, "exercises": []}


def create_exercise(name: str, group: str, equipment_type: str = None, exercise_type: str = None) -> Dict:
    """Создаёт упражнение, возвращает объект."""
    pool = get_pool()
    if not pool:
        raise RuntimeError("YDB not configured")
    ex_id = str(uuid.uuid4())
    eq = equipment_type or 'barbell'
    ex_t = exercise_type or 'compound'
    w_type = 'Barbell'
    base_wt = 0.0
    mult = 1
    try:
        pool.execute_with_retries(f"""
            UPSERT INTO exercises (id, name, muscle_group, description, image_url, image_url2,
                equipment_type, exercise_type, weight_type, base_weight, multiplier)
            VALUES ("{ex_id}", "{_esc(name)}", "{_esc(group)}", "", "", "",
                "{_esc(eq)}", "{_esc(ex_t)}", "{_esc(w_type)}", {base_wt}, {mult});
        """)
        logger.info(f"create_exercise: saved id={ex_id} name={name}")
    except Exception as e:
        logger.error(f"create_exercise UPSERT failed: {e}", exc_info=True)
        raise
    return {
        'id': ex_id, 'name': name, 'muscleGroup': group, 'description': '', 'imageUrl': '', 'imageUrl2': '',
        'equipmentType': eq, 'exerciseType': ex_t, 'weightType': w_type, 'baseWeight': base_wt,
        'weightMultiplier': mult, 'allow_1rm': True
    }


def update_exercise(ex_id: str, data: Dict) -> bool:
    """Обновляет упражнение."""
    pool = get_pool()
    if not pool:
        return False
    updates = []
    if 'name' in data:
        updates.append(f'name = "{_esc(str(data["name"]))}"')
    if 'muscleGroup' in data:
        updates.append(f'muscle_group = "{_esc(str(data["muscleGroup"]))}"')
    if 'description' in data:
        updates.append(f'description = "{_esc(str(data.get("description", "")))}"')
    if 'imageUrl' in data:
        updates.append(f'image_url = "{_esc(str(data.get("imageUrl", "")))}"')
    if updates:
        pool.execute_with_retries(f"""
            UPDATE exercises SET {", ".join(updates)} WHERE id = "{_esc(ex_id)}";
        """)
    return True


def _esc(s: str) -> str:
    """Экранирование для YQL строки."""
    if s is None:
        return ""
    return str(s).replace('\\', '\\\\').replace('"', '\\"')


# --- Log (подходы) ---

def save_set(data: Dict) -> Dict:
    """Сохраняет подход. Возвращает {status, row_number} где row_number = log_id."""
    pool = get_pool()
    if not pool:
        return {"status": "error", "error": "YDB not configured"}
    log_id = str(uuid.uuid4())
    now = datetime.now(MOSCOW_TZ).strftime('%Y.%m.%d')
    now_dt = datetime.now(MOSCOW_TZ).strftime('%Y.%m.%d, %H:%M')
    ex_id = str(data.get('exercise_id', ''))
    ex_name = str(data.get('exercise_name', ''))
    input_wt = _to_float(data.get('input_weight'))
    total_wt = _to_float(data.get('weight'))
    reps = _to_int(data.get('reps'))
    rest = _to_float(data.get('rest'))
    set_group = str(data.get('set_group_id', ''))
    note = str(data.get('note', ''))
    ord_val = _to_int(data.get('order'))
    tbl = _log_table()
    try:
        if tbl == 'workout_logs':
            pool.execute_with_retries(f"""
                UPSERT INTO {tbl} (id, date_time, exercise_id, input_weight, total_weight, reps, rest, set_group_id, note, sort_order)
                VALUES ("{log_id}", "{now_dt}", "{_esc(ex_id)}", {input_wt}, {total_wt}, {reps}, {rest}, "{_esc(set_group)}", "{_esc(note)}", {ord_val});
            """)
        else:
            pool.execute_with_retries(f"""
                UPSERT INTO {tbl} (id, date, exercise_id, exercise_name, input_weight, total_weight, reps, rest, set_group_id, note, ord)
                VALUES ("{log_id}", "{now}", "{_esc(ex_id)}", "{_esc(ex_name)}", {input_wt}, {total_wt}, {reps}, {rest}, "{_esc(set_group)}", "{_esc(note)}", {ord_val});
            """)
        return {"status": "success", "row_number": log_id}
    except Exception as e:
        logger.error(f"save_set: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}


def update_set(data: Dict) -> bool:
    """Обновляет подход по id (row_number)."""
    pool = get_pool()
    if not pool:
        return False
    row_id = str(data.get('row_number', ''))
    if not row_id:
        return False
    total_wt = _to_float(data.get('weight'))
    reps = _to_int(data.get('reps'))
    rest = _to_float(data.get('rest'))
    tbl = _log_table()
    try:
        pool.execute_with_retries(f"""
            UPDATE {tbl} SET total_weight = {total_wt}, reps = {reps}, rest = {rest}
            WHERE id = "{_esc(row_id)}";
        """)
        return True
    except Exception as e:
        logger.error(f"update_set: {e}", exc_info=True)
        return False


def _log_table() -> str:
    """Таблица логов: log или workout_logs (из env)."""
    return os.environ.get('YDB_LOG_TABLE', 'log')


def _log_date_col() -> str:
    """Колонка даты: date (log) или date_time (workout_logs)."""
    return 'date_time' if _log_table() == 'workout_logs' else 'date'


def _parse_date_val(val) -> str:
    """Из date_time '2026.02.04, 20:39' извлекает '2026.02.04'."""
    s = str(val or '').strip()
    if ',' in s:
        s = s.split(',')[0].strip()
    return s


def get_exercise_history(exercise_id: str, limit: int = 50) -> Dict:
    """История подходов по упражнению. Формат: {history: [{date, sets: [...]}], note}."""
    pool = get_pool()
    if not pool:
        return {"history": [], "note": ""}
    tbl = _log_table()
    date_col = _log_date_col()
    try:
        result_sets = pool.execute_with_retries(f"""
            SELECT * FROM {tbl}
            WHERE exercise_id = "{_esc(exercise_id)}"
            ORDER BY {date_col} DESC;
        """)
        items = []
        for row in result_sets[0].rows:
            raw_date = _row_val(row, 'date', 'Date', 'date_time', 'DateTime')
            items.append({
                'date': _parse_date_val(raw_date),
                'weight': _to_float(_row_val(row, 'total_weight', 'totalWeight', 'Total_Weight', 'weight', 'Weight')),
                'reps': _to_int(_row_val(row, 'reps', 'Reps')),
                'rest': _to_float(_row_val(row, 'rest', 'Rest')),
                'order': _to_int(_row_val(row, 'ord', 'order', 'Order', 'sort_order', 'Sort_Order')),
                'setGroupId': _row_val(row, 'set_group_id', 'setGroupId', 'Set_Group_ID') or None,
            })
        grouped = {}
        for item in items:
            d = item['date']
            if d not in grouped:
                grouped[d] = []
            grouped[d].append(item)
        result = [{'date': d, 'sets': sorted(grouped[d], key=lambda x: x.get('order', 0))}
                  for d in sorted(grouped.keys(), reverse=True)[:limit]]
        return {"history": result, "note": ""}
    except Exception as e:
        logger.error(f"get_exercise_history: {e}", exc_info=True)
        return {"history": [], "note": ""}


def get_global_history() -> List[Dict]:
    """Глобальная история тренировок по дням."""
    pool = get_pool()
    if not pool:
        return []
    try:
        tbl = _log_table()
        date_col = _log_date_col()
        result_sets = pool.execute_with_retries(f"""
            SELECT * FROM {tbl}
            ORDER BY {date_col} DESC;
        """)
        ex_map = {e['id']: e for e in get_all_exercises()['exercises']}
        days = {}
        for row in result_sets[0].rows:
            raw_date = _row_val(row, 'date', 'Date', 'date_time', 'DateTime')
            date_val = _parse_date_val(raw_date)
            ex_id = _row_val(row, 'exercise_id', 'exerciseId', 'Exercise_ID')
            ex_info = ex_map.get(ex_id, {})
            ex_name = ex_info.get('name') or _row_val(row, 'exercise_name', 'exerciseName', 'Exercise_Name') or 'Unknown'
            muscle = ex_info.get('muscleGroup', 'Other')
            if date_val not in days:
                days[date_val] = {"date": date_val, "muscleGroups": set(), "exercises": []}
            days[date_val]["muscleGroups"].add(muscle)
            days[date_val]["exercises"].append({
                "id": _row_val(row, 'id', 'ID'),
                "exerciseId": ex_id,
                "exerciseName": ex_name,
                "weight": _to_float(_row_val(row, 'total_weight', 'totalWeight', 'weight', 'Weight')),
                "reps": _to_int(_row_val(row, 'reps', 'Reps')),
                "rest": _to_float(_row_val(row, 'rest', 'Rest')),
                "order": _to_int(_row_val(row, 'ord', 'order', 'Order', 'sort_order', 'Sort_Order')),
                "setGroupId": _row_val(row, 'set_group_id', 'setGroupId', 'Set_Group_ID') or ""
            })
        result = []
        for date_val, day_data in sorted(days.items(), key=lambda x: x[0], reverse=True):
            raw = day_data["exercises"]
            raw.sort(key=lambda x: x.get('order', 0))
            exercises_grouped = {}
            for ex in raw:
                key = f"{ex['exerciseName']}_{ex.get('setGroupId', '')}" or ex['exerciseName']
                if key not in exercises_grouped:
                    exercises_grouped[key] = {"name": ex["exerciseName"], "exerciseId": ex.get("exerciseId", ""), "setGroupId": ex.get("setGroupId", ""), "sets": []}
                exercises_grouped[key]["sets"].append({
                    "id": ex.get("id"),
                    "exerciseId": ex.get("exerciseId"),
                    "setGroupId": ex.get("setGroupId", ""),
                    "order": ex.get("order", 0),
                    "weight": ex["weight"],
                    "reps": ex["reps"],
                    "rest": ex["rest"]
                })
            set_group_count = {}
            for ex_data in exercises_grouped.values():
                sg = ex_data.get("setGroupId", "")
                if sg:
                    set_group_count[sg] = set_group_count.get(sg, 0) + 1
            grouped_list = []
            for ex_data in exercises_grouped.values():
                sg = ex_data.get("setGroupId", "")
                is_superset = sg and set_group_count.get(sg, 0) > 1
                grouped_list.append({
                    "name": ex_data["name"],
                    "exerciseId": ex_data.get("exerciseId", ""),
                    "supersetId": sg if is_superset else None,
                    "sets": ex_data["sets"]
                })
            result.append({
                "id": date_val,
                "date": date_val,
                "muscleGroups": sorted(list(day_data["muscleGroups"])),
                "duration": f"{len(raw) * 2}м",
                "exercises": grouped_list
            })
        return result
    except Exception as e:
        logger.error(f"get_global_history: {e}", exc_info=True)
        return []
