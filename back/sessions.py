"""
Sessions domain: управление тренировочными сессиями (start/finish).
"""

import logging
import uuid
from datetime import datetime
from typing import Dict

import ydb

from db_pool import get_pool
from db_utils import MOSCOW_TZ, to_float

logger = logging.getLogger(__name__)


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
        """, {"$id": session_id, "$date_str": date_str, "$body_weight": to_float(body_weight)})
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
        """, {"$session_id": session_id, "$duration_sec": ydb.TypedValue(duration_sec, ydb.PrimitiveType.Int32), "$srpe": to_float(srpe), "$body_weight": to_float(body_weight)})
        return True
    except Exception as e:
        logger.error(f"finish_session: {e}", exc_info=True)
        return False
