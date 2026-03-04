"""
Yandex Cloud Function — API для GymTracker (YDB)
Обрабатывает запросы по ?url=/api/xxx
"""

import json
import os
import logging
from urllib.parse import parse_qs, urlparse

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def json_response(data, status=200):
    """Формирует HTTP-ответ с CORS"""
    body = json.dumps(data, ensure_ascii=False) if not isinstance(data, str) else data
    return {
        'statusCode': status,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
        },
        'body': body,
    }


# --- API handlers (YDB) ---

try:
    from ydb_store import (
        get_all_exercises,
        get_exercise_history,
        get_global_history,
        save_set as ydb_save_set,
        update_set as ydb_update_set,
        delete_set as ydb_delete_set,
        create_exercise as ydb_create_exercise,
        update_exercise as ydb_update_exercise,
        start_session as ydb_start_session,
        finish_session as ydb_finish_session,
        get_volume_load,
        get_acwr,
        get_muscle_volume,
        export_logs_csv,
    )
    HAS_YDB = True
except ImportError:
    HAS_YDB = False


def api_init(params, body, headers):
    """GET /api/init — группы и упражнения"""
    if HAS_YDB:
        data = get_all_exercises()
        return json_response(data)
    return json_response({'groups': [], 'exercises': []})


def api_history(params, body, headers):
    """GET /api/history?exercise_id=xxx"""
    exercise_id = params.get('exercise_id', [None])[0]
    if not exercise_id:
        return json_response({'error': 'Missing exercise_id'}, 400)
    if HAS_YDB:
        data = get_exercise_history(exercise_id)
        return json_response(data)
    return json_response({'history': [], 'note': ''})


def api_global_history(params, body, headers):
    """GET /api/global_history — глобальная история тренировок"""
    if HAS_YDB:
        try:
            data = get_global_history()
            return json_response(data)
        except Exception as e:
            logger.error(f"api_global_history: {e}", exc_info=True)
            return json_response({'error': str(e)}, 500)
    return json_response([])


def api_save_set(params, body, headers):
    """POST /api/save_set"""
    try:
        data = json.loads(body) if body else {}
        if HAS_YDB:
            result = ydb_save_set(data)
            if result.get('status') == 'success':
                return json_response(result)
            return json_response({'error': result.get('error', 'Unknown')}, 500)
        return json_response({'status': 'success', 'row_number': 0})
    except Exception as e:
        logger.error(f"api_save_set: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_update_set(params, body, headers):
    """POST /api/update_set"""
    try:
        data = json.loads(body) if body else {}
        if HAS_YDB:
            ok = ydb_update_set(data)
            return json_response({'status': 'success' if ok else 'error'})
        return json_response({'status': 'success'})
    except Exception as e:
        logger.error(f"api_update_set: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_delete_set(params, body, headers):
    """POST /api/delete_set"""
    try:
        data = json.loads(body) if body else {}
        row_id = data.get('row_number') or data.get('id')
        if not row_id:
            return json_response({'error': 'Missing row_number'}, 400)
        if HAS_YDB:
            ok = ydb_delete_set(str(row_id))
            return json_response({'status': 'success' if ok else 'error'})
        return json_response({'status': 'success'})
    except Exception as e:
        logger.error(f"api_delete_set: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_create_exercise(params, body, headers):
    """POST /api/create_exercise"""
    try:
        data = json.loads(body) if body else {}
        if not data.get('name') or not data.get('group'):
            return json_response({'error': 'Missing name or group'}, 400)
        if HAS_YDB:
            ex = ydb_create_exercise(data['name'], data['group'])
            return json_response(ex)
        return json_response({'id': 'new-id', 'name': data['name'], 'muscleGroup': data['group']})
    except Exception as e:
        logger.error(f"api_create_exercise: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_update_exercise(params, body, headers):
    """POST /api/update_exercise"""
    try:
        data = json.loads(body) if body else {}
        ex_id = data.get('id')
        if not ex_id:
            return json_response({'error': 'Missing id'}, 400)
        updates = data.get('updates', data)
        if HAS_YDB:
            ok = ydb_update_exercise(ex_id, updates)
            return json_response({'status': 'success' if ok else 'error'})
        return json_response({'status': 'success'})
    except Exception as e:
        logger.error(f"api_update_exercise: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_ping(params, body, headers):
    """GET /api/ping"""
    return json_response({'status': 'ok'})


def api_analytics(params, body, headers):
    """GET /api/analytics?period=14&exercise_id=xxx"""
    period = int(params.get('period', [14])[0])
    exercise_id = params.get('exercise_id', [None])[0]
    if HAS_YDB:
        try:
            volume = get_volume_load(period, exercise_id)
            acwr = get_acwr()
            muscle_data = get_muscle_volume(period)
            return json_response({
                'proposals': [],
                'baseline': {},
                'volume': volume,
                'acwr': acwr,
                'muscleVolume': muscle_data.get('volume', {}),
                'muscleSets': muscle_data.get('sets', {}),
            })
        except Exception as e:
            logger.error(f"api_analytics: {e}", exc_info=True)
    return json_response({'proposals': [], 'baseline': {}, 'volume': 0, 'acwr': {'status': 'optimal'}})


def api_confirm_baseline(params, body, headers):
    """POST /api/confirm_baseline"""
    try:
        data = json.loads(body) if body else {}
        if not data.get('proposalId') or data.get('action') not in ('CONFIRM', 'SNOOZE', 'DECLINE'):
            return json_response({'error': 'Invalid request'}, 400)
        # TODO: логика подтверждения baseline в YDB
        return json_response({'status': 'ok'})
    except Exception as e:
        logger.error(f"api_confirm_baseline: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_upload_image(params, body, headers):
    """POST /api/upload_image (multipart)"""
    # TODO: загрузка в Object Storage или YDB
    return json_response({'url': ''}, 400)


def api_start_session(params, body, headers):
    """POST /api/start_session — body: {body_weight?: number}"""
    try:
        data = json.loads(body) if body else {}
        body_weight = float(data.get('body_weight', 0))

        if HAS_YDB:
            result = ydb_start_session(body_weight)
            return json_response(result)
        return json_response({'session_id': '', 'date': ''})
    except Exception as e:
        logger.error(f"api_start_session: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_finish_session(params, body, headers):
    """POST /api/finish_session — body: {session_id, srpe?: number, body_weight?: number}"""
    try:
        data = json.loads(body) if body else {}
        session_id = data.get('session_id', '')
        if not session_id:
            return json_response({'error': 'Missing session_id'}, 400)
        srpe = float(data.get('srpe', 0))
        body_weight = float(data.get('body_weight', 0))

        if HAS_YDB:
            ok = ydb_finish_session(session_id, srpe, body_weight)
            return json_response({'status': 'success' if ok else 'error'})
        return json_response({'status': 'success'})
    except Exception as e:
        logger.error(f"api_finish_session: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_export_csv(params, body, headers):
    """GET /api/export_csv — экспорт логов в CSV"""
    csv_content = export_logs_csv() if HAS_YDB else ''
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="gymtracker_export.csv"',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
        },
        'body': csv_content,
    }


# CORS headers (для OPTIONS и ответов). Регистр заголовков может зависеть от платформы.
HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
}
# Ответ только для OPTIONS (без body, чтобы не путать preflight)
OPTIONS_RESPONSE = {"statusCode": 200, "headers": HEADERS, "body": ""}

# Секретный токен (из переменной окружения)
AUTH_TOKEN = os.environ.get('AUTH_TOKEN', '')

# Маршрутизатор
ROUTES = {
    'init': ('GET', api_init),
    'history': ('GET', api_history),
    'global_history': ('GET', api_global_history),
    'save_set': ('POST', api_save_set),
    'update_set': ('POST', api_update_set),
    'delete_set': ('POST', api_delete_set),
    'create_exercise': ('POST', api_create_exercise),
    'update_exercise': ('POST', api_update_exercise),
    'ping': ('GET', api_ping),
    'analytics': ('GET', api_analytics),
    'confirm_baseline': ('POST', api_confirm_baseline),
    'upload_image': ('POST', api_upload_image),
    'start_session': ('POST', api_start_session),
    'finish_session': ('POST', api_finish_session),
    'export_csv': ('GET', api_export_csv),
}


def handler(event, context):
    event = event or {}

    # 1. Надежно определяем метод (Yandex может отдавать httpMethod, http_method, requestContext.http.method)
    http_method = (
        event.get('httpMethod')
        or event.get('http_method')
        or (event.get('requestContext') or {}).get('http', {}).get('method')
        or ''
    )
    if isinstance(http_method, str):
        http_method = http_method.upper()
    else:
        http_method = 'GET'

    if http_method == 'OPTIONS':
        return OPTIONS_RESPONSE

    # 2. Проверяем секретный токен (заголовки могут быть в headers или requestContext.request.headers; ключи — с разным регистром)
    headers = event.get('headers', {}) or {}
    if not headers and event.get('requestContext'):
        headers = (event.get('requestContext') or {}).get('request', {}).get('headers', {}) or {}
    # Нормализуем ключи к нижнему регистру для надёжности
    headers_lower = {k.lower(): v for k, v in (headers or {}).items() if isinstance(v, str)}
    auth_header = (headers_lower.get('x-auth-token') or headers_lower.get('authorization') or '').strip()
    if auth_header.startswith('Bearer '):
        auth_header = auth_header[7:].strip()
    if AUTH_TOKEN and auth_header != AUTH_TOKEN:
        logger.info("Auth failed: token_configured=%s, header_present=%s", bool(AUTH_TOKEN), bool(auth_header))
        return {"statusCode": 403, "headers": HEADERS, "body": json.dumps({"error": "Forbidden"})}

    path = event.get('url', '') or event.get('path', '')
    if not path and event.get('queryStringParameters'):
        path = (event.get('queryStringParameters') or {}).get('url', '') or ''

    try:
        http_method = http_method or 'GET'
        body = event.get('body') or ''
        if not body and event.get('requestContext'):
            body = (event.get('requestContext') or {}).get('request', {}).get('body') or body

        # Парсим path: ?url=/api/global_history или path
        qs_params = event.get('queryStringParameters') or {}
        url_param = qs_params.get('url') if isinstance(qs_params, dict) else None
        if not url_param and path:
            parsed = urlparse(path if path.startswith('http') else f'http://x{path}')
            query = parse_qs(parsed.query)
            url_param = (query.get('url') or [parsed.path or '/api/ping'])[0]
        if not url_param:
            url_param = '/api/ping'

        # /api/endpoint -> endpoint
        if '/api/' in url_param:
            endpoint = url_param.split('/api/')[-1].split('?')[0].strip('/')
        else:
            endpoint = 'ping'

        method, handler_fn = ROUTES.get(endpoint, (None, None))
        if not handler_fn:
            return json_response({'error': f'Route not found: {endpoint}'}, 404)

        if method and http_method.upper() != method:
            return json_response({'error': f'Method {http_method} not allowed'}, 405)

        # Нормализуем query: queryStringParameters = {k: v} -> {k: [v]} для совместимости с parse_qs
        query = qs_params if isinstance(qs_params, dict) else {}
        query = {k: [v] if not isinstance(v, list) else v for k, v in query.items()}
        if path and '?' in path:
            parsed = urlparse(path if path.startswith('http') else f'http://x{path}')
            if parsed.query:
                query = parse_qs(parsed.query)

        # Декодируем body если base64
        if isinstance(body, str) and body:
            try:
                import base64
                body = base64.b64decode(body).decode('utf-8')
            except Exception:
                pass

        result = handler_fn(query, body or '', headers)
        return result

    except Exception as e:
        logger.error(f"Handler error: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)
