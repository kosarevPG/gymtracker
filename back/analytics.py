"""
Analytics domain: тоннаж, ACWR, история тренировок, CSV-экспорт.
"""

import csv
import io
import logging
from datetime import datetime, timedelta
from typing import Dict, List

from db_pool import get_pool
from db_utils import MOSCOW_TZ, to_float, to_int
from exercises import get_all_exercises, _load_all_exercise_muscles

logger = logging.getLogger(__name__)


def _parse_date_val(val) -> str:
    """Из date_time '2026.02.04, 20:39' извлекает '2026.02.04'."""
    s = str(val or '').strip()
    if ',' in s:
        s = s.split(',')[0].strip()
    return s


EXPORT_CSV_LIMIT = 50000


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
                to_int(getattr(row, 'ord', 0)),
                ex_name,
                to_float(getattr(row, 'input_weight', None)),
                to_float(getattr(row, 'total_weight', None)),
                to_int(getattr(row, 'reps', 0)),
                to_float(getattr(row, 'rest', None)),
                str(getattr(row, 'set_type', '') or ''),
                to_float(rpe_val) if rpe_val is not None and str(rpe_val).strip() != '' else '',
                to_int(rir_val) if rir_val is not None and str(rir_val).strip() != '' else '',
                bool(getattr(row, 'is_low_confidence', False)),
                str(getattr(row, 'session_id', '') or ''),
            ])
        return out.getvalue()
    except Exception as e:
        logger.error(f"export_logs_csv: {e}", exc_info=True)
        return ''


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
            w = to_float(getattr(row, 'total_weight', None))
            rp = to_int(getattr(row, 'reps', 0))
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
            w = to_float(getattr(row, 'total_weight', None))
            rp = to_int(getattr(row, 'reps', 0))
            tonnage = w * rp

            muscles = all_muscles.get(ex_id, [])
            if muscles:
                for m in muscles:
                    mg = m.get('muscle_group', 'Other')
                    factor = to_float(m.get('weight_factor'), 1.0)
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
                'weight': to_float(getattr(row, 'total_weight', None)),
                'reps': to_int(getattr(row, 'reps', 0)),
                'rest': to_float(getattr(row, 'rest', None)),
                'order': to_int(getattr(row, 'ord', 0)),
                'setGroupId': getattr(row, 'set_group_id', None) or None,
                'set_type': str(set_type_val) if set_type_val else None,
                'rpe': to_float(rpe_val) if rpe_val is not None and str(rpe_val).strip() != '' else None,
                'rir': to_int(rir_val) if rir_val is not None and str(rir_val).strip() != '' else None,
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
            "weight": to_float(getattr(row, 'total_weight', None)),
            "reps": to_int(getattr(row, 'reps', 0)),
            "rest": to_float(getattr(row, 'rest', None)),
            "order": to_int(getattr(row, 'ord', 0)),
            "setGroupId": getattr(row, 'set_group_id', '') or "",
            "set_type": str(set_type_val) if set_type_val else None,
            "rpe": to_float(rpe_val) if rpe_val is not None and str(rpe_val).strip() != '' else None,
            "rir": to_int(rir_val) if rir_val is not None and str(rir_val).strip() != '' else None,
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
