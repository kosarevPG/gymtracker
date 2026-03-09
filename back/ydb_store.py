"""
YDB хранилище для GymTracker.
Таблицы: exercises, log (подходы).
Переменные окружения: YDB_ENDPOINT, YDB_DATABASE.
Для Yandex Cloud Function: YDB_METADATA_CREDENTIALS=1 или service account key.
"""

import csv
import io
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

import ydb

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
        _driver.wait(timeout=10, fail_fast=True)
        _pool = ydb.QuerySessionPool(_driver)
        return _pool
    except Exception as e:
        logger.error(f"YDB init failed: {e}", exc_info=True)
        return None


def _safe_get(obj, *keys, default=None):
    """Безопасное получение значения из объекта (row или dict). Поддерживает snake_case и camelCase."""
    for key in keys:
        try:
            if hasattr(obj, key):
                return getattr(obj, key, default)
            if isinstance(obj, dict):
                return obj.get(key, default)
        except (KeyError, AttributeError, TypeError):
            pass
    return default


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


def _parse_iso_timestamp(s: Optional[str]) -> Optional[datetime]:
    """Парсит ISO timestamp от клиента. Возвращает datetime в UTC или None."""
    if not s or not str(s).strip():
        return None
    try:
        s = str(s).replace('Z', '+00:00').replace('z', '+00:00')
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _db_ts_to_datetime(ts) -> Optional[datetime]:
    """Конвертирует YDB Timestamp в datetime для сравнения."""
    if ts is None:
        return None
    if hasattr(ts, 'timestamp'):
        return datetime.fromtimestamp(ts.timestamp(), tz=timezone.utc)
    try:
        us = int(ts)
        return datetime.fromtimestamp(us / 1_000_000, tz=timezone.utc)
    except (ValueError, TypeError):
        return None


def _ts_to_iso(ts) -> Optional[str]:
    """Конвертирует YDB Timestamp в ISO строку для API."""
    dt = _db_ts_to_datetime(ts)
    return dt.isoformat() if dt else None


# --- Exercises ---

def get_all_exercises() -> Dict:
    """Возвращает {groups: [...], exercises: [...]}."""
    pool = get_pool()
    if not pool:
        return {"groups": DEFAULT_GROUPS, "exercises": []}
    try:
        result_sets = pool.execute_with_retries("SELECT * FROM exercises ORDER BY name;")
        exercises = []
        groups = set()
        for row in result_sets[0].rows:
            ex_id = getattr(row, 'id', '')
            name = getattr(row, 'name', '')
            muscle = getattr(row, 'muscle_group', '')
            ex = {
                'id': str(ex_id),
                'name': str(name),
                'muscleGroup': str(muscle) if muscle else '',
                'description': str(getattr(row, 'description', '') or ''),
                'imageUrl': str(getattr(row, 'image_url', '') or ''),
                'imageUrl2': str(getattr(row, 'image_url2', '') or ''),
                'equipmentType': str(getattr(row, 'equipment_type', '') or 'barbell'),
                'exerciseType': str(getattr(row, 'exercise_type', '') or 'compound'),
                'weightType': str(getattr(row, 'weight_type', '') or 'Barbell'),
                'baseWeight': _to_float(getattr(row, 'base_weight', None)),
                'weightMultiplier': _to_float(getattr(row, 'multiplier', None), 1.0),
                'bodyWeightFactor': _to_float(_safe_get(row, 'body_weight_factor', 'bodyWeightFactor'), 1.0),
                'secondaryMuscles': str(getattr(row, 'secondary_muscles', '') or ''),
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
        pool.execute_with_retries("""
            DECLARE $id AS Utf8;
            DECLARE $name AS Utf8;
            DECLARE $group AS Utf8;
            DECLARE $eq AS Utf8;
            DECLARE $ex_t AS Utf8;
            DECLARE $w_type AS Utf8;
            UPSERT INTO exercises (id, name, muscle_group, secondary_muscles, description, image_url, image_url2,
                equipment_type, exercise_type, weight_type, base_weight, multiplier)
            VALUES ($id, $name, $group, "", "", "", "", $eq, $ex_t, $w_type, 0.0, 1);
        """, {
            "$id": ex_id,
            "$name": name or "",
            "$group": group or "",
            "$eq": eq,
            "$ex_t": ex_t,
            "$w_type": w_type,
        })
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
    params = {"$id": ex_id}
    decl = ["DECLARE $id AS Utf8;"]
    if 'name' in data:
        updates.append('name = $name')
        params["$name"] = str(data.get("name", ""))
        decl.append("DECLARE $name AS Utf8;")
    if 'muscleGroup' in data:
        updates.append('muscle_group = $muscle_group')
        params["$muscle_group"] = str(data.get("muscleGroup", ""))
        decl.append("DECLARE $muscle_group AS Utf8;")
    if 'description' in data:
        updates.append('description = $description')
        params["$description"] = str(data.get("description", ""))
        decl.append("DECLARE $description AS Utf8;")
    if 'imageUrl' in data:
        updates.append('image_url = $image_url')
        params["$image_url"] = str(data.get("imageUrl", ""))
        decl.append("DECLARE $image_url AS Utf8;")
    if 'secondaryMuscles' in data:
        updates.append('secondary_muscles = $secondary_muscles')
        params["$secondary_muscles"] = str(data.get("secondaryMuscles", ""))
        decl.append("DECLARE $secondary_muscles AS Utf8;")
    if 'weightMultiplier' in data:
        mult_val = _to_float(data.get('weightMultiplier'), 1.0)
        updates.append('multiplier = $multiplier')
        params["$multiplier"] = mult_val
        decl.append("DECLARE $multiplier AS Double;")
    if 'bodyWeightFactor' in data:
        bwf = _to_float(data.get('bodyWeightFactor'), 1.0)
        updates.append('body_weight_factor = $body_weight_factor')
        params["$body_weight_factor"] = bwf
        decl.append("DECLARE $body_weight_factor AS Double;")
    if updates:
        pool.execute_with_retries("\n".join(decl) + f"\nUPDATE exercises SET {', '.join(updates)} WHERE id = $id;", params)

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

def _get_max_weight_in_session(pool, ex_id: str, session_id: str, set_group: str) -> float:
    """Максимальный вес по упражнению в текущей сессии (для авто-разметки warmup)."""
    try:
        sid = session_id or set_group
        if not sid:
            return 0.0
        r = pool.execute_with_retries("""
            DECLARE $ex_id AS Utf8;
            DECLARE $sid AS Utf8;
            SELECT MAX(total_weight) as m FROM log WHERE exercise_id = $ex_id AND (set_group_id = $sid OR session_id = $sid);
        """, {"$ex_id": ex_id, "$sid": sid})
        if r and r[0].rows and hasattr(r[0].rows[0], 'm') and r[0].rows[0].m is not None:
            return _to_float(r[0].rows[0].m)
    except Exception as e:
        logger.debug(f"_get_max_weight_in_session: {e}")
    return 0.0


def save_set(data: Dict) -> Dict:
    """Сохраняет подход. Возвращает {status, row_number} где row_number = log_id.
    Поддерживает Frontend-driven ID: если передан id или row_number, используется он (для offline-first)."""
    pool = get_pool()
    if not pool:
        return {"status": "error", "error": "YDB not configured"}
    log_id = str(data.get('id') or data.get('row_number') or uuid.uuid4())
    now = datetime.now(MOSCOW_TZ).strftime('%Y.%m.%d')
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
        max_wt = _get_max_weight_in_session(pool, ex_id, session_id_val, set_group)
        if max_wt > 0 and total_wt < 0.6 * max_wt:
            set_type = 'warmup'
    rpe_val = _to_float(data.get('rpe')) if data.get('rpe') is not None and str(data.get('rpe')).strip() != '' else None
    rir_val = _to_int(data.get('rir')) if data.get('rir') is not None and str(data.get('rir')).strip() != '' else None
    _, is_low = calculate_e1rm(total_wt, reps)
    if data.get('is_low_confidence') is not None:
        is_low = bool(data.get('is_low_confidence'))
    # YDB SDK: Python int -> Int64, нужен явный Uint32; None для Optional — TypedValue
    rpe_param = (ydb.TypedValue(None, ydb.OptionalType(ydb.PrimitiveType.Double))
                 if rpe_val is None else float(rpe_val))
    rir_param = (ydb.TypedValue(None, ydb.OptionalType(ydb.PrimitiveType.Uint32))
                 if rir_val is None else int(rir_val))
    reps_u32 = ydb.TypedValue(max(0, int(reps)), ydb.PrimitiveType.Uint32)
    ord_u32 = ydb.TypedValue(max(0, int(ord_val)), ydb.PrimitiveType.Uint32)
    try:
        params = {
            "$id": str(log_id), "$date_val": str(now), "$ex_id": str(ex_id), "$ex_name": str(ex_name),
            "$input_wt": float(input_wt), "$total_wt": float(total_wt), "$reps": reps_u32, "$rest": float(rest),
            "$set_group": str(set_group), "$session_id": str(session_id_val), "$note": str(note),
            "$ord_val": ord_u32, "$set_type": str(set_type or "working"),
            "$rpe": rpe_param, "$rir": rir_param, "$is_low": bool(is_low),
        }
        pool.execute_with_retries("""
            DECLARE $id AS Utf8;
            DECLARE $date_val AS Utf8;
            DECLARE $ex_id AS Utf8;
            DECLARE $ex_name AS Utf8;
            DECLARE $input_wt AS Double;
            DECLARE $total_wt AS Double;
            DECLARE $reps AS Uint32;
            DECLARE $rest AS Double;
            DECLARE $set_group AS Utf8;
            DECLARE $session_id AS Utf8;
            DECLARE $note AS Utf8;
            DECLARE $ord_val AS Uint32;
            DECLARE $set_type AS Utf8;
            DECLARE $rpe AS Double?;
            DECLARE $rir AS Uint32?;
            DECLARE $is_low AS Bool;
            UPSERT INTO log (id, date, exercise_id, exercise_name, input_weight, total_weight, reps, rest, set_group_id, session_id, note, ord, set_type, rpe, rir, is_low_confidence)
            VALUES ($id, $date_val, $ex_id, $ex_name, $input_wt, $total_wt, $reps, $rest, $set_group, $session_id, $note, $ord_val, $set_type, $rpe, $rir, $is_low);
        """, params)
        now_iso = datetime.now(timezone.utc).isoformat()
        return {"status": "success", "row_number": log_id, "updated_at": now_iso}
    except Exception as e:
        logger.error(f"save_set: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}


def update_set(data: Dict) -> Dict:
    """Обновляет подход по id (row_number). Возвращает {status: success|conflict|error}."""
    pool = get_pool()
    if not pool:
        return {"status": "error", "error": "YDB not configured"}
    row_id = str(data.get('row_number', ''))
    if not row_id:
        return {"status": "error", "error": "row_number required"}
    total_wt = _to_float(data.get('weight'))
    reps = _to_int(data.get('reps'))
    rest = _to_float(data.get('rest'))
    try:
        pool.execute_with_retries("""
            DECLARE $row_id AS Utf8;
            DECLARE $total_wt AS Double;
            DECLARE $reps AS Uint32;
            DECLARE $rest AS Double;
            UPDATE log SET total_weight = $total_wt, reps = $reps, rest = $rest
            WHERE id = $row_id;
        """, {"$row_id": row_id, "$total_wt": total_wt, "$reps": ydb.TypedValue(max(0, int(reps)), ydb.PrimitiveType.Uint32), "$rest": rest})
        return {"status": "success"}
    except Exception as e:
        logger.error(f"update_set: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}


def delete_set(row_id: str) -> bool:
    """Удаляет подход по id."""
    pool = get_pool()
    if not pool:
        return False
    if not row_id:
        return False
    try:
        pool.execute_with_retries("""
            DECLARE $row_id AS Utf8;
            DELETE FROM log WHERE id = $row_id;
        """, {"$row_id": row_id})
        return True
    except Exception as e:
        logger.error(f"delete_set: {e}", exc_info=True)
        return False


def _parse_date_val(val) -> str:
    """Из date_time '2026.02.04, 20:39' извлекает '2026.02.04'."""
    s = str(val or '').strip()
    if ',' in s:
        s = s.split(',')[0].strip()
    return s


EXPORT_CSV_LIMIT = 50000  # Ограничение для предотвращения таймаута при большом объёме данных

def export_logs_csv() -> str:
    """Экспорт записей из таблицы log в CSV. Сортировка по дате по убыванию. BOM для корректной кириллицы в Excel."""
    pool = get_pool()
    if not pool:
        return ''
    columns = ['id', 'date', 'order', 'exercise_name', 'input_weight', 'total_weight', 'reps', 'rest', 'set_type', 'rpe', 'rir', 'is_low_confidence', 'session_id']
    try:
        result = pool.execute_with_retries(f"""
            SELECT id, date, exercise_id, exercise_name, input_weight, total_weight, reps, rest, set_group_id, session_id, note, ord, set_type, rpe, rir, is_low_confidence FROM log ORDER BY date DESC LIMIT {EXPORT_CSV_LIMIT};
        """)
        rows = result[0].rows if result and result[0].rows else []
        ex_map = {e['id']: e for e in get_all_exercises()['exercises']}
        out = io.StringIO(newline='')
        out.write('\ufeff')
        writer = csv.writer(out, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        writer.writerow(columns)
        for row in rows:
            raw_date = getattr(row, 'date', '')
            date_val = _parse_date_val(raw_date) if raw_date else str(raw_date or '')
            ex_id = getattr(row, 'exercise_id', '')
            ex_info = ex_map.get(ex_id, {})
            ex_name = ex_info.get('name') or getattr(row, 'exercise_name', '') or 'Unknown'
            rpe_val = getattr(row, 'rpe', None)
            rir_val = getattr(row, 'rir', None)
            writer.writerow([
                str(getattr(row, 'id', '') or ''),
                date_val,
                _to_int(getattr(row, 'ord', 0)),
                ex_name,
                _to_float(getattr(row, 'input_weight', None)),
                _to_float(getattr(row, 'total_weight', None)),
                _to_int(getattr(row, 'reps', 0)),
                _to_float(getattr(row, 'rest', None)),
                str(getattr(row, 'set_type', '') or ''),
                _to_float(rpe_val) if rpe_val is not None and str(rpe_val).strip() != '' else '',
                _to_int(rir_val) if rir_val is not None and str(rir_val).strip() != '' else '',
                bool(getattr(row, 'is_low_confidence', False)),
                str(getattr(row, 'session_id', '') or ''),
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
    date_str = now.strftime('%Y.%m.%d')
    try:
        pool.execute_with_retries("""
            DECLARE $id AS Utf8;
            DECLARE $date_str AS Utf8;
            DECLARE $body_weight AS Double;
            UPSERT INTO sessions (id, date, start_ts, end_ts, duration_sec, srpe, body_weight)
            VALUES ($id, $date_str, CurrentUtcDatetime(), CurrentUtcDatetime(), 0, 0, $body_weight);
        """, {"$id": session_id, "$date_str": date_str, "$body_weight": _to_float(body_weight)})
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
        result = pool.execute_with_retries("""
            DECLARE $session_id AS Utf8;
            SELECT start_ts FROM sessions WHERE id = $session_id;
        """, {"$session_id": session_id})
        if not result or not result[0].rows:
            return False
        start_ts = getattr(result[0].rows[0], 'start_ts', None)
        if start_ts is None:
            return False
        start_sec = int(start_ts.timestamp()) if hasattr(start_ts, 'timestamp') else int(start_ts) // 1_000_000
        duration_sec = max(0, int(now.timestamp()) - start_sec)
        pool.execute_with_retries("""
            DECLARE $session_id AS Utf8;
            DECLARE $duration_sec AS Int32;
            DECLARE $srpe AS Double;
            DECLARE $body_weight AS Double;
            UPDATE sessions SET end_ts = CurrentUtcDatetime(), duration_sec = $duration_sec, srpe = $srpe, body_weight = $body_weight
            WHERE id = $session_id;
        """, {"$session_id": session_id, "$duration_sec": ydb.TypedValue(duration_sec, ydb.PrimitiveType.Int32), "$srpe": _to_float(srpe), "$body_weight": _to_float(body_weight)})
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
        result = pool.execute_with_retries("""
            DECLARE $exercise_id AS Utf8;
            SELECT muscle_group, weight_factor FROM exercise_muscles WHERE exercise_id = $exercise_id;
        """, {"$exercise_id": exercise_id})
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
        pool.execute_with_retries("""
            DECLARE $exercise_id AS Utf8;
            DECLARE $muscle_group AS Utf8;
            DECLARE $weight_factor AS Double;
            UPSERT INTO exercise_muscles (exercise_id, muscle_group, weight_factor)
            VALUES ($exercise_id, $muscle_group, $weight_factor);
        """, {"$exercise_id": exercise_id, "$muscle_group": muscle_group, "$weight_factor": _to_float(weight_factor)})
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
        result = pool.execute_with_retries("""
            DECLARE $ex_id AS Utf8;
            SELECT muscle_group FROM exercises WHERE id = $ex_id;
        """, {"$ex_id": ex_id})
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
        pool.execute_with_retries("""
            DECLARE $exercise_id AS Utf8;
            DECLARE $primary_muscle AS Utf8;
            DELETE FROM exercise_muscles
            WHERE exercise_id = $exercise_id AND muscle_group != $primary_muscle;
        """, {"$exercise_id": exercise_id, "$primary_muscle": primary_muscle})
        return True
    except Exception as e:
        logger.error(f"delete_secondary_muscles: {e}", exc_info=True)
        return False


def get_volume_load(days: int = 7, exercise_id: str = None) -> float:
    """Тоннаж (Volume Load) за последние days дней, только set_type='working'."""
    pool = get_pool()
    if not pool:
        return 0.0
    cutoff = (datetime.now(MOSCOW_TZ) - timedelta(days=days)).strftime('%Y.%m.%d')
    try:
        if exercise_id:
            r = pool.execute_with_retries("""
                DECLARE $cutoff AS Utf8;
                DECLARE $exercise_id AS Utf8;
                SELECT date, total_weight, reps, set_type FROM log WHERE date >= $cutoff AND exercise_id = $exercise_id LIMIT 3000;
            """, {"$cutoff": cutoff, "$exercise_id": exercise_id})
        else:
            r = pool.execute_with_retries("""
                DECLARE $cutoff AS Utf8;
                SELECT date, total_weight, reps, set_type FROM log WHERE date >= $cutoff LIMIT 3000;
            """, {"$cutoff": cutoff})
        total = 0.0
        for row in (r[0].rows if r and r[0].rows else []):
            st = str(getattr(row, 'set_type', '') or '').lower()
            if st and st != 'working':
                continue
            w = _to_float(getattr(row, 'total_weight', None))
            rp = _to_int(getattr(row, 'reps', 0))
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
    cutoff = (datetime.now(MOSCOW_TZ) - timedelta(days=days)).strftime('%Y.%m.%d')
    ex_map = {e['id']: e for e in get_all_exercises()['exercises']}
    all_muscles = _load_all_exercise_muscles()
    muscle_vol = {}
    muscle_sets = {}
    try:
        r = pool.execute_with_retries("""
            DECLARE $cutoff AS Utf8;
            SELECT date, exercise_id, total_weight, reps, set_type FROM log WHERE date >= $cutoff LIMIT 2000;
        """, {"$cutoff": cutoff})
        for row in (r[0].rows if r and r[0].rows else []):
            st = str(getattr(row, 'set_type', '') or '').lower()
            if st and st != 'working':
                continue
            ex_id = getattr(row, 'exercise_id', '')
            w = _to_float(getattr(row, 'total_weight', None))
            rp = _to_int(getattr(row, 'reps', 0))
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
    try:
        result_sets = pool.execute_with_retries("""
            DECLARE $exercise_id AS Utf8;
            SELECT id, date, total_weight, reps, rest, ord, set_group_id, set_type, rpe, rir FROM log WHERE exercise_id = $exercise_id ORDER BY date DESC;
        """, {"$exercise_id": exercise_id})
        items = []
        for row in result_sets[0].rows:
            raw_date = getattr(row, 'date', '')
            set_type_val = getattr(row, 'set_type', None) or None
            rpe_val = getattr(row, 'rpe', None)
            rir_val = getattr(row, 'rir', None)
            items.append({
                'id': getattr(row, 'id', ''),
                'date': _parse_date_val(raw_date),
                'weight': _to_float(getattr(row, 'total_weight', None)),
                'reps': _to_int(getattr(row, 'reps', 0)),
                'rest': _to_float(getattr(row, 'rest', None)),
                'order': _to_int(getattr(row, 'ord', 0)),
                'setGroupId': getattr(row, 'set_group_id', None) or None,
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
    # LIMIT через f-string — YDB требует Uint64 для параметра, Python передаёт Int64
    result_sets = pool.execute_with_retries(f"""
        SELECT id, date, exercise_id, exercise_name, total_weight, reps, rest, ord, set_group_id, set_type, rpe, rir FROM log
        ORDER BY date DESC LIMIT {limit_rows};
    """)
    ex_map = {e['id']: e for e in get_all_exercises()['exercises']}
    days = {}
    for row in result_sets[0].rows:
        raw_date = getattr(row, 'date', '')
        date_val = _parse_date_val(raw_date)
        ex_id = getattr(row, 'exercise_id', '')
        ex_info = ex_map.get(ex_id, {})
        ex_name = ex_info.get('name') or getattr(row, 'exercise_name', '') or 'Unknown'
        muscle = ex_info.get('muscleGroup', 'Other')
        if date_val not in days:
            days[date_val] = {"date": date_val, "muscleGroups": set(), "exercises": []}
        days[date_val]["muscleGroups"].add(muscle)
        set_type_val = getattr(row, 'set_type', None) or None
        rpe_val = getattr(row, 'rpe', None)
        rir_val = getattr(row, 'rir', None)
        days[date_val]["exercises"].append({
            "id": getattr(row, 'id', ''),
            "exerciseId": ex_id,
            "exerciseName": ex_name,
            "weight": _to_float(getattr(row, 'total_weight', None)),
            "reps": _to_int(getattr(row, 'reps', 0)),
            "rest": _to_float(getattr(row, 'rest', None)),
            "order": _to_int(getattr(row, 'ord', 0)),
            "setGroupId": getattr(row, 'set_group_id', '') or "",
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
                "rir": ex.get("rir"),
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
