"""
Exercises domain: CRUD для упражнений и управление exercise_muscles (фракционный учёт).
"""

import logging
import uuid
from typing import Dict, List, Optional

from db_pool import get_pool
from db_utils import DEFAULT_GROUPS, safe_get, to_float

logger = logging.getLogger(__name__)


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
                'baseWeight': to_float(getattr(row, 'base_weight', None)),
                'weightMultiplier': to_float(getattr(row, 'multiplier', None), 1.0),
                'bodyWeightFactor': to_float(safe_get(row, 'body_weight_factor', 'bodyWeightFactor'), 1.0),
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
    if 'imageUrl2' in data:
        updates.append('image_url2 = $image_url2')
        params["$image_url2"] = str(data.get("imageUrl2", ""))
        decl.append("DECLARE $image_url2 AS Utf8;")
    if 'secondaryMuscles' in data:
        updates.append('secondary_muscles = $secondary_muscles')
        params["$secondary_muscles"] = str(data.get("secondaryMuscles", ""))
        decl.append("DECLARE $secondary_muscles AS Utf8;")
    if 'equipmentType' in data:
        updates.append('equipment_type = $equipment_type')
        params["$equipment_type"] = str(data.get("equipmentType", "barbell"))
        decl.append("DECLARE $equipment_type AS Utf8;")
    if 'exerciseType' in data:
        updates.append('exercise_type = $exercise_type')
        params["$exercise_type"] = str(data.get("exerciseType", "compound"))
        decl.append("DECLARE $exercise_type AS Utf8;")
    if 'weightType' in data:
        updates.append('weight_type = $weight_type')
        params["$weight_type"] = str(data.get("weightType", "Barbell"))
        decl.append("DECLARE $weight_type AS Utf8;")
    if 'baseWeight' in data:
        bw_val = to_float(data.get('baseWeight'), 0.0)
        updates.append('base_weight = $base_weight')
        params["$base_weight"] = bw_val
        decl.append("DECLARE $base_weight AS Double;")
    if 'weightMultiplier' in data:
        mult_val = to_float(data.get('weightMultiplier'), 1.0)
        updates.append('multiplier = $multiplier')
        params["$multiplier"] = mult_val
        decl.append("DECLARE $multiplier AS Double;")
    if 'bodyWeightFactor' in data:
        bwf = to_float(data.get('bodyWeightFactor'), 1.0)
        updates.append('body_weight_factor = $body_weight_factor')
        params["$body_weight_factor"] = bwf
        decl.append("DECLARE $body_weight_factor AS Double;")
    if updates:
        pool.execute_with_retries("\n".join(decl) + f"\nUPDATE exercises SET {', '.join(updates)} WHERE id = $id;", params)

    if primary_muscle:
        upsert_exercise_muscle(ex_id, primary_muscle, 1.0)

    if 'secondaryMuscles' in data:
        sec_raw = str(data.get('secondaryMuscles', '') or '').strip()
        if sec_raw:
            for muscle in (m.strip() for m in sec_raw.split(',') if m.strip()):
                if muscle != primary_muscle:
                    upsert_exercise_muscle(ex_id, muscle, 0.5)
        else:
            delete_secondary_muscles(ex_id, primary_muscle or '')

    return True


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
                "weight_factor": to_float(getattr(r, 'weight_factor', None), 1.0)
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
        return [{"muscle_group": str(r.muscle_group), "weight_factor": to_float(r.weight_factor, 1.0)}
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
        """, {"$exercise_id": exercise_id, "$muscle_group": muscle_group, "$weight_factor": to_float(weight_factor)})
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
