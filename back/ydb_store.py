"""
YDB хранилище для GymTracker.
Таблицы: exercises, log (подходы).
Переменные окружения: YDB_ENDPOINT, YDB_DATABASE.
Для Yandex Cloud Function: YDB_METADATA_CREDENTIALS=1 или service account key.
"""

import csv
import io
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
            secondary_muscles Utf8,
            description Utf8,
            image_url Utf8,
            image_url2 Utf8,
            equipment_type Utf8,
            exercise_type Utf8,
            weight_type Utf8,
            base_weight Double,
            multiplier Double,
            body_weight_factor Double,
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
            session_id Utf8,
            note Utf8,
            ord Uint32,
            set_type Utf8,
            rpe Double,
            rir Uint32,
            is_low_confidence Bool,
            PRIMARY KEY (id)
        );
    """)
    pool.execute_with_retries("""
        CREATE TABLE IF NOT EXISTS sessions (
            id Utf8,
            date Utf8,
            start_ts Timestamp,
            end_ts Timestamp,
            duration_sec Int32,
            srpe Double,
            body_weight Double,
            PRIMARY KEY (id)
        );
    """)
    pool.execute_with_retries("""
        CREATE TABLE IF NOT EXISTS exercise_muscles (
            exercise_id Utf8,
            muscle_group Utf8,
            weight_factor Double,
            PRIMARY KEY (exercise_id, muscle_group)
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
                'weightMultiplier': _to_float(_row_val(row, 'weight_multiplier', 'weightMultiplier', 'Multiplier', 'multiplier'), 1.0),
                'bodyWeightFactor': _to_float(_row_val(row, 'body_weight_factor', 'bodyWeightFactor'), 1.0),
                'secondaryMuscles': str(_row_val(row, 'secondary_muscles', 'secondaryMuscles', 'Secondary_Muscles') or ''),
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
            UPSERT INTO exercises (id, name, muscle_group, secondary_muscles, description, image_url, image_url2,
                equipment_type, exercise_type, weight_type, base_weight, multiplier)
            VALUES ("{ex_id}", "{_esc(name)}", "{_esc(group)}", "", "", "", "",
                "{_esc(eq)}", "{_esc(ex_t)}", "{_esc(w_type)}", {base_wt}, {mult});
        """)
        logger.info(f"create_exercise: saved id={ex_id} name={name}")
    except Exception as e:
        logger.error(f"create_exercise UPSERT failed: {e}", exc_info=True)
        raise
    return {
        'id': ex_id, 'name': name, 'muscleGroup': group, 'secondaryMuscles': '', 'description': '', 'imageUrl': '', 'imageUrl2': '',
        'equipmentType': eq, 'exerciseType': ex_t, 'weightType': w_type, 'baseWeight': base_wt,
        'weightMultiplier': mult, 'allow_1rm': True
    }


def update_exercise(ex_id: str, data: Dict) -> bool:
    """Обновляет упражнение и таблицу exercise_muscles (фракционный учёт)."""
    pool = get_pool()
    if not pool:
        return False
    # primary_muscle: из data или из БД (нужно до UPDATE для delete_secondary_muscles)
    primary_muscle = data.get('muscleGroup') or _get_exercise_muscle_group(ex_id)
    if isinstance(primary_muscle, str):
        primary_muscle = primary_muscle.strip() or None

    updates = []
    if 'name' in data:
        updates.append(f'name = "{_esc(str(data["name"]))}"')
    if 'muscleGroup' in data:
        updates.append(f'muscle_group = "{_esc(str(data["muscleGroup"]))}"')
    if 'description' in data:
        updates.append(f'description = "{_esc(str(data.get("description", "")))}"')
    if 'imageUrl' in data:
        updates.append(f'image_url = "{_esc(str(data.get("imageUrl", "")))}"')
    if 'secondaryMuscles' in data:
        updates.append(f'secondary_muscles = "{_esc(str(data.get("secondaryMuscles", "")))}"')
    if 'weightMultiplier' in data:
        mult_val = _to_float(data.get('weightMultiplier'), 1.0)
        updates.append(f'multiplier = {mult_val}')
    if 'bodyWeightFactor' in data:
        bwf = _to_float(data.get('bodyWeightFactor'), 1.0)
        updates.append(f'body_weight_factor = {bwf}')
    if updates:
        pool.execute_with_retries(f"""
            UPDATE exercises SET {", ".join(updates)} WHERE id = "{_esc(ex_id)}";
        """)

    # exercise_muscles: primary + secondaryMuscles
    if primary_muscle:
        upsert_exercise_muscle(ex_id, primary_muscle, 1.0)

    if 'secondaryMuscles' in data:
        sec_raw = str(data.get('secondaryMuscles', '') or '').strip()
        if sec_raw:
            for muscle in (m.strip() for m in sec_raw.split(',') if m.strip()):
                if muscle != primary_muscle:  # не перезаписывать primary
                    upsert_exercise_muscle(ex_id, muscle, 0.5)
        else:
            delete_secondary_muscles(ex_id, primary_muscle or '')

    return True


def _esc(s: str) -> str:
    """Экранирование для YQL строки."""
    if s is None:
        return ""
    return str(s).replace('\\', '\\\\').replace('"', '\\"')


def calculate_e1rm(weight: float, reps: int) -> tuple:
    """
    Вычисляет e1RM и флаг is_low_confidence.
    reps 1-5: Эпли W*(1+R/30)
    reps 6-10: Бжицки W/(1.0278-0.0278*R)
    reps > 12: is_low_confidence=True
    """
    if weight <= 0 or reps <= 0:
        return 0.0, False
    if reps <= 5:
        e1rm = weight * (1 + reps / 30.0)
        return round(e1rm, 1), False
    if reps <= 10:
        denom = 1.0278 - 0.0278 * reps
        if denom <= 0:
            return round(weight, 1), True
        e1rm = weight / denom
        return round(e1rm, 1), False
    e1rm = weight * (1 + reps / 30.0)
    return round(e1rm, 1), True


# --- Log (подходы) ---

def _get_max_weight_in_session(pool, tbl: str, ex_id: str, session_id: str, set_group: str) -> float:
    """Максимальный вес по упражнению в текущей сессии (для авто-разметки warmup)."""
    try:
        sid = session_id or set_group
        if not sid:
            return 0.0
        date_col = _log_date_col()
        if tbl == 'workout_logs':
            q = f'SELECT MAX(total_weight) as m FROM {tbl} WHERE exercise_id = "{_esc(ex_id)}" AND (set_group_id = "{_esc(sid)}" OR session_id = "{_esc(sid)}");'
        else:
            q = f'SELECT MAX(total_weight) as m FROM {tbl} WHERE exercise_id = "{_esc(ex_id)}" AND (set_group_id = "{_esc(sid)}" OR session_id = "{_esc(sid)}");'
        r = pool.execute_with_retries(q)
        if r and r[0].rows and hasattr(r[0].rows[0], 'm') and r[0].rows[0].m is not None:
            return _to_float(r[0].rows[0].m)
    except Exception as e:
        logger.debug(f"_get_max_weight_in_session: {e}")
    return 0.0


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
    session_id_val = str(data.get('session_id', '') or set_group)
    note = str(data.get('note', ''))
    ord_val = _to_int(data.get('order'))
    set_type = str(data.get('set_type', 'working') or 'working')
    set_type_explicit = 'set_type' in data and data.get('set_type') is not None and str(data.get('set_type')).strip() != ''
    if not set_type_explicit and total_wt > 0 and reps > 0:
        tbl = _log_table()
        max_wt = _get_max_weight_in_session(pool, tbl, ex_id, session_id_val, set_group)
        if max_wt > 0 and total_wt < 0.6 * max_wt:
            set_type = 'warmup'
    rpe_val = _to_float(data.get('rpe')) if data.get('rpe') is not None and str(data.get('rpe')).strip() != '' else None
    rir_val = _to_int(data.get('rir')) if data.get('rir') is not None and str(data.get('rir')).strip() != '' else None
    _, is_low = calculate_e1rm(total_wt, reps)
    if data.get('is_low_confidence') is not None:
        is_low = bool(data.get('is_low_confidence'))
    rpe_sql = f', {rpe_val}' if rpe_val is not None else ', NULL'
    rir_sql = f', {rir_val}' if rir_val is not None else ', NULL'
    tbl = _log_table()
    try:
        if tbl == 'workout_logs':
            pool.execute_with_retries(f"""
                UPSERT INTO {tbl} (id, date_time, exercise_id, input_weight, total_weight, reps, rest, set_group_id, session_id, note, sort_order, set_type, rpe, rir, is_low_confidence)
                VALUES ("{log_id}", "{now_dt}", "{_esc(ex_id)}", {input_wt}, {total_wt}, {reps}, {rest}, "{_esc(set_group)}", "{_esc(session_id_val)}", "{_esc(note)}", {ord_val}, "{_esc(set_type)}"{rpe_sql}{rir_sql}, {str(is_low).lower()});
            """)
        else:
            pool.execute_with_retries(f"""
                UPSERT INTO {tbl} (id, date, exercise_id, exercise_name, input_weight, total_weight, reps, rest, set_group_id, session_id, note, ord, set_type, rpe, rir, is_low_confidence)
                VALUES ("{log_id}", "{now}", "{_esc(ex_id)}", "{_esc(ex_name)}", {input_wt}, {total_wt}, {reps}, {rest}, "{_esc(set_group)}", "{_esc(session_id_val)}", "{_esc(note)}", {ord_val}, "{_esc(set_type)}"{rpe_sql}{rir_sql}, {str(is_low).lower()});
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


def delete_set(row_id: str) -> bool:
    """Удаляет подход по id."""
    pool = get_pool()
    if not pool:
        return False
    if not row_id:
        return False
    tbl = _log_table()
    try:
        pool.execute_with_retries(f'DELETE FROM {tbl} WHERE id = "{_esc(row_id)}";')
        return True
    except Exception as e:
        logger.error(f"delete_set: {e}", exc_info=True)
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


def export_logs_csv() -> str:
    """Экспорт всех записей из таблицы логов в CSV. Сортировка по дате по убыванию."""
    pool = get_pool()
    if not pool:
        return ''
    tbl = _log_table()
    date_col = _log_date_col()
    columns = ['id', 'date', 'exercise_name', 'input_weight', 'total_weight', 'reps', 'rest', 'set_type', 'rpe', 'rir', 'is_low_confidence', 'session_id']
    try:
        result = pool.execute_with_retries(f"""
            SELECT id, {date_col}, exercise_name, input_weight, total_weight, reps, rest, set_type, rpe, rir, is_low_confidence, session_id
            FROM {tbl}
            ORDER BY {date_col} DESC;
        """)
        rows = result[0].rows if result and result[0].rows else []
        out = io.StringIO(newline='')
        writer = csv.writer(out, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        writer.writerow(columns)
        for row in rows:
            raw_date = _row_val(row, date_col, 'date', 'date_time', 'Date', 'DateTime')
            date_val = _parse_date_val(raw_date) if raw_date else str(raw_date or '')
            writer.writerow([
                str(_row_val(row, 'id', 'ID') or ''),
                date_val,
                str(_row_val(row, 'exercise_name', 'exerciseName', 'Exercise_Name') or ''),
                _to_float(_row_val(row, 'input_weight', 'inputWeight', 'Input_Weight')),
                _to_float(_row_val(row, 'total_weight', 'totalWeight', 'Total_Weight')),
                _to_int(_row_val(row, 'reps', 'Reps')),
                _to_float(_row_val(row, 'rest', 'Rest')),
                str(_row_val(row, 'set_type', 'setType', 'Set_Type') or ''),
                _to_float(_row_val(row, 'rpe', 'RPE')) if _row_val(row, 'rpe', 'RPE') not in (None, '') else '',
                _to_int(_row_val(row, 'rir', 'RIR')) if _row_val(row, 'rir', 'RIR') not in (None, '') else '',
                bool(getattr(row, 'is_low_confidence', False)) if hasattr(row, 'is_low_confidence') else False,
                str(_row_val(row, 'session_id', 'sessionId', 'Session_ID') or ''),
            ])
        return out.getvalue()
    except Exception as e:
        logger.error(f"export_logs_csv: {e}", exc_info=True)
        return ''


# --- Sessions ---

def start_session(body_weight: float = 0) -> Dict:
    """Создаёт сессию тренировки. Возвращает {session_id, ...}."""
    pool = get_pool()
    if not pool:
        return {"session_id": "", "error": "YDB not configured"}
    session_id = str(uuid.uuid4())
    now = datetime.now(MOSCOW_TZ)
    now_ts = int(now.timestamp() * 1_000_000)
    date_str = now.strftime('%Y.%m.%d')
    try:
        pool.execute_with_retries(f"""
            UPSERT INTO sessions (id, date, start_ts, end_ts, duration_sec, srpe, body_weight)
            VALUES ("{session_id}", "{date_str}", DateTime::FromMicroseconds({now_ts}), DateTime::FromMicroseconds({now_ts}), 0, 0, {_to_float(body_weight)});
        """)
        return {"session_id": session_id, "date": date_str}
    except Exception as e:
        logger.error(f"start_session: {e}", exc_info=True)
        return {"session_id": "", "error": str(e)}


def finish_session(session_id: str, srpe: float = 0, body_weight: float = 0) -> bool:
    """Завершает сессию: end_ts, duration_sec, srpe, body_weight."""
    pool = get_pool()
    if not pool or not session_id:
        return False
    try:
        now = datetime.now(MOSCOW_TZ)
        now_ts = int(now.timestamp() * 1_000_000)
        result = pool.execute_with_retries(f"""
            SELECT start_ts FROM sessions WHERE id = "{_esc(session_id)}";
        """)
        if not result or not result[0].rows:
            return False
        start_ts = getattr(result[0].rows[0], 'start_ts', None)
        if start_ts is None:
            return False
        start_sec = int(start_ts.timestamp()) if hasattr(start_ts, 'timestamp') else int(start_ts) // 1_000_000
        duration_sec = int(now.timestamp()) - start_sec
        pool.execute_with_retries(f"""
            UPDATE sessions SET end_ts = DateTime::FromMicroseconds({now_ts}), duration_sec = {duration_sec}, srpe = {_to_float(srpe)}, body_weight = {_to_float(body_weight)}
            WHERE id = "{_esc(session_id)}";
        """)
        return True
    except Exception as e:
        logger.error(f"finish_session: {e}", exc_info=True)
        return False


# --- Exercise muscles (для фракционного учёта объёма) ---

def _load_all_exercise_muscles() -> Dict[str, List[Dict]]:
    """Загружает все связи exercise_id -> [{muscle_group, weight_factor}] одним запросом."""
    pool = get_pool()
    if not pool:
        return {}
    try:
        result = pool.execute_with_retries("SELECT exercise_id, muscle_group, weight_factor FROM exercise_muscles")
        out = {}
        for r in (result[0].rows if result and result[0].rows else []):
            ex_id = str(getattr(r, 'exercise_id', ''))
            if ex_id not in out:
                out[ex_id] = []
            out[ex_id].append({
                "muscle_group": str(getattr(r, 'muscle_group', 'Other')),
                "weight_factor": _to_float(getattr(r, 'weight_factor', None), 1.0)
            })
        return out
    except Exception as e:
        logger.error(f"_load_all_exercise_muscles: {e}", exc_info=True)
        return {}


def get_exercise_muscles(exercise_id: str) -> List[Dict]:
    """Возвращает список muscle_group, weight_factor для упражнения."""
    pool = get_pool()
    if not pool:
        return []
    try:
        result = pool.execute_with_retries(f"""
            SELECT muscle_group, weight_factor FROM exercise_muscles WHERE exercise_id = "{_esc(exercise_id)}";
        """)
        return [{"muscle_group": str(r.muscle_group), "weight_factor": _to_float(r.weight_factor, 1.0)}
                for r in result[0].rows]
    except Exception as e:
        logger.error(f"get_exercise_muscles: {e}", exc_info=True)
        return []


def upsert_exercise_muscle(exercise_id: str, muscle_group: str, weight_factor: float = 1.0) -> bool:
    """Добавляет или обновляет связь упражнение-мышца."""
    pool = get_pool()
    if not pool:
        return False
    try:
        pool.execute_with_retries(f"""
            UPSERT INTO exercise_muscles (exercise_id, muscle_group, weight_factor)
            VALUES ("{_esc(exercise_id)}", "{_esc(muscle_group)}", {_to_float(weight_factor)});
        """)
        return True
    except Exception as e:
        logger.error(f"upsert_exercise_muscle: {e}", exc_info=True)
        return False


def _get_exercise_muscle_group(ex_id: str) -> Optional[str]:
    """Возвращает muscle_group упражнения из БД или None."""
    pool = get_pool()
    if not pool:
        return None
    try:
        result = pool.execute_with_retries(f'SELECT muscle_group FROM exercises WHERE id = "{_esc(ex_id)}";')
        if result and result[0].rows:
            return str(result[0].rows[0].muscle_group or '').strip() or None
    except Exception as e:
        logger.error(f"_get_exercise_muscle_group: {e}", exc_info=True)
    return None


def delete_secondary_muscles(exercise_id: str, primary_muscle: str) -> bool:
    """Удаляет записи синергистов (оставляет только primary с фактором 1.0)."""
    if not primary_muscle:
        return False
    pool = get_pool()
    if not pool:
        return False
    try:
        pool.execute_with_retries(f"""
            DELETE FROM exercise_muscles
            WHERE exercise_id = "{_esc(exercise_id)}" AND muscle_group != "{_esc(primary_muscle)}";
        """)
        return True
    except Exception as e:
        logger.error(f"delete_secondary_muscles: {e}", exc_info=True)
        return False


def get_volume_load(days: int = 7, exercise_id: str = None) -> float:
    """Тоннаж (Volume Load) за последние days дней, только set_type='working'."""
    pool = get_pool()
    if not pool:
        return 0.0
    tbl = _log_table()
    date_col = _log_date_col()
    cutoff = (datetime.now(MOSCOW_TZ) - timedelta(days=days)).strftime('%Y.%m.%d')
    try:
        where = f'{date_col} >= "{cutoff}"'
        if exercise_id:
            where = f'{where} AND exercise_id = "{_esc(exercise_id)}"'
        q = f'SELECT {date_col}, total_weight, reps, set_type FROM {tbl} WHERE {where} LIMIT 3000;'
        r = pool.execute_with_retries(q)
        total = 0.0
        for row in (r[0].rows if r and r[0].rows else []):
            st = str(_row_val(row, 'set_type', 'setType') or '').lower()
            if st and st != 'working':
                continue
            w = _to_float(_row_val(row, 'total_weight', 'totalWeight'))
            rp = _to_int(_row_val(row, 'reps', 'Reps'))
            total += w * rp
        return round(total, 1)
    except Exception as e:
        logger.error(f"get_volume_load: {e}", exc_info=True)
        return 0.0


def get_muscle_volume(days: int = 7) -> Dict[str, float]:
    """Тоннаж по группам мышц за последние days дней (только working).
    Использует exercise_muscles: muscle_group + weight_factor. Если записей нет — muscleGroup из exercises с фактором 1.0."""
    pool = get_pool()
    if not pool:
        return {}
    tbl = _log_table()
    date_col = _log_date_col()
    cutoff = (datetime.now(MOSCOW_TZ) - timedelta(days=days)).strftime('%Y.%m.%d')
    ex_map = {e['id']: e for e in get_all_exercises()['exercises']}
    all_muscles = _load_all_exercise_muscles()
    muscle_vol = {}
    muscle_sets = {}
    try:
        q = f'SELECT {date_col}, exercise_id, total_weight, reps, set_type FROM {tbl} WHERE {date_col} >= "{cutoff}" LIMIT 2000;'
        r = pool.execute_with_retries(q)
        for row in (r[0].rows if r and r[0].rows else []):
            st = str(_row_val(row, 'set_type', 'setType') or '').lower()
            if st and st != 'working':
                continue
            ex_id = _row_val(row, 'exercise_id', 'exerciseId')
            w = _to_float(_row_val(row, 'total_weight', 'totalWeight'))
            rp = _to_int(_row_val(row, 'reps', 'Reps'))
            tonnage = w * rp

            muscles = all_muscles.get(ex_id, [])
            if muscles:
                for m in muscles:
                    mg = m.get('muscle_group', 'Other')
                    factor = _to_float(m.get('weight_factor'), 1.0)
                    muscle_vol[mg] = muscle_vol.get(mg, 0) + tonnage * factor
                    muscle_sets[mg] = muscle_sets.get(mg, 0) + factor
            else:
                ex_info = ex_map.get(ex_id, {})
                mg = ex_info.get('muscleGroup', 'Other')
                muscle_vol[mg] = muscle_vol.get(mg, 0) + tonnage
                muscle_sets[mg] = muscle_sets.get(mg, 0) + 1
        return {"volume": muscle_vol, "sets": muscle_sets}
    except Exception as e:
        logger.error(f"get_muscle_volume: {e}", exc_info=True)
        return {"volume": {}, "sets": {}}


def get_acwr() -> Dict:
    """ACWR: acute (7d) / chronic (28d avg). Статус: under, optimal, danger."""
    acute = get_volume_load(7)
    chronic_4w = get_volume_load(28)
    chronic = chronic_4w / 4.0 if chronic_4w > 0 else 0
    ratio = acute / chronic if chronic > 0 else 0
    if ratio < 0.8:
        status = 'under'
    elif ratio <= 1.3:
        status = 'optimal'
    elif ratio > 1.5:
        status = 'danger'
    else:
        status = 'optimal'
    return {"acute": acute, "chronic": round(chronic, 1), "ratio": round(ratio, 2), "status": status}


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
            set_type_val = _row_val(row, 'set_type', 'setType', 'Set_Type') or None
            rpe_val = _row_val(row, 'rpe', 'RPE')
            rir_val = _row_val(row, 'rir', 'RIR')
            items.append({
                'date': _parse_date_val(raw_date),
                'weight': _to_float(_row_val(row, 'total_weight', 'totalWeight', 'Total_Weight', 'weight', 'Weight')),
                'reps': _to_int(_row_val(row, 'reps', 'Reps')),
                'rest': _to_float(_row_val(row, 'rest', 'Rest')),
                'order': _to_int(_row_val(row, 'ord', 'order', 'Order', 'sort_order', 'Sort_Order')),
                'setGroupId': _row_val(row, 'set_group_id', 'setGroupId', 'Set_Group_ID') or None,
                'set_type': str(set_type_val) if set_type_val else None,
                'rpe': _to_float(rpe_val) if rpe_val is not None and str(rpe_val).strip() != '' else None,
                'rir': _to_int(rir_val) if rir_val is not None and str(rir_val).strip() != '' else None,
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


def get_global_history(limit_rows: int = 1500) -> List[Dict]:
    """Глобальная история тренировок по дням. Ограничение строк — защита от 504 при большом объёме данных."""
    pool = get_pool()
    if not pool:
        return []
    try:
        tbl = _log_table()
        date_col = _log_date_col()
        result_sets = pool.execute_with_retries(f"""
            SELECT id, {date_col}, exercise_id, exercise_name, total_weight, reps, rest, ord, set_group_id, set_type, rpe, rir FROM {tbl}
            ORDER BY {date_col} DESC
            LIMIT {limit_rows};
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
            set_type_val = _row_val(row, 'set_type', 'setType', 'Set_Type') or None
            rpe_val = _row_val(row, 'rpe', 'RPE')
            rir_val = _row_val(row, 'rir', 'RIR')
            days[date_val]["exercises"].append({
                "id": _row_val(row, 'id', 'ID'),
                "exerciseId": ex_id,
                "exerciseName": ex_name,
                "weight": _to_float(_row_val(row, 'total_weight', 'totalWeight', 'weight', 'Weight')),
                "reps": _to_int(_row_val(row, 'reps', 'Reps')),
                "rest": _to_float(_row_val(row, 'rest', 'Rest')),
                "order": _to_int(_row_val(row, 'ord', 'order', 'Order', 'sort_order', 'Sort_Order')),
                "setGroupId": _row_val(row, 'set_group_id', 'setGroupId', 'Set_Group_ID') or "",
                "set_type": str(set_type_val) if set_type_val else None,
                "rpe": _to_float(rpe_val) if rpe_val is not None and str(rpe_val).strip() != '' else None,
                "rir": _to_int(rir_val) if rir_val is not None and str(rir_val).strip() != '' else None,
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
                    "rest": ex["rest"],
                    "set_type": ex.get("set_type"),
                    "rpe": ex.get("rpe"),
                    "rir": ex.get("rir")
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
