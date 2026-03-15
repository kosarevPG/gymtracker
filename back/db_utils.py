"""
Утилиты для работы с YDB: конвертация типов, парсинг timestamp, константы.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

MOSCOW_TZ = timezone(timedelta(hours=3))
DEFAULT_GROUPS = ['Спина', 'Ноги', 'Грудь', 'Плечи', 'Трицепс', 'Бицепс', 'Пресс', 'Кардио']


def safe_get(obj, *keys, default=None):
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


def to_float(v, default=0.0) -> float:
    if v is None:
        return default
    try:
        return float(str(v).replace(',', '.').strip() or 0)
    except (ValueError, TypeError):
        return default


def to_int(v, default=0) -> int:
    try:
        return int(to_float(v, default))
    except (ValueError, TypeError):
        return default


def parse_iso_timestamp(s: Optional[str]) -> Optional[datetime]:
    """Парсит ISO timestamp от клиента. Возвращает datetime в UTC или None."""
    if not s or not str(s).strip():
        return None
    try:
        s = str(s).replace('Z', '+00:00').replace('z', '+00:00')
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def db_ts_to_datetime(ts) -> Optional[datetime]:
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


def ts_to_iso(ts) -> Optional[str]:
    """Конвертирует YDB Timestamp в ISO строку для API."""
    dt = db_ts_to_datetime(ts)
    return dt.isoformat() if dt else None
