"""
Sets domain: CRUD для подходов (log table), расчёт e1RM.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Dict

import ydb

from db_pool import get_pool
from db_utils import MOSCOW_TZ, to_float, to_int

logger = logging.getLogger(__name__)


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
            return to_float(r[0].rows[0].m)
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
    input_wt = to_float(data.get('input_weight'))
    total_wt = to_float(data.get('weight'))
    reps = to_int(data.get('reps'))
    rest = to_float(data.get('rest'))
    set_group = str(data.get('set_group_id', ''))
    session_id_val = str(data.get('session_id', '') or set_group)
    note = str(data.get('note', ''))
    ord_val = to_int(data.get('order'))
    set_type = str(data.get('set_type', 'working') or 'working')
    set_type_explicit = 'set_type' in data and data.get('set_type') is not None and str(data.get('set_type')).strip() != ''
    if not set_type_explicit and total_wt > 0 and reps > 0:
        max_wt = _get_max_weight_in_session(pool, ex_id, session_id_val, set_group)
        if max_wt > 0 and total_wt < 0.6 * max_wt:
            set_type = 'warmup'
    rpe_val = to_float(data.get('rpe')) if data.get('rpe') is not None and str(data.get('rpe')).strip() != '' else None
    rir_val = to_int(data.get('rir')) if data.get('rir') is not None and str(data.get('rir')).strip() != '' else None
    _, is_low = calculate_e1rm(total_wt, reps)
    if data.get('is_low_confidence') is not None:
        is_low = bool(data.get('is_low_confidence'))
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
    total_wt = to_float(data.get('weight'))
    reps = to_int(data.get('reps'))
    rest = to_float(data.get('rest'))
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
