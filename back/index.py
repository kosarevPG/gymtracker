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
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
        'body': body,
    }


def get_ydb_driver():
    """Инициализация драйвера YDB (замените на вашу конфигурацию)"""
    try:
        import ydb
        endpoint = os.environ.get('YDB_ENDPOINT', '')
        database = os.environ.get('YDB_DATABASE', '')
        if endpoint and database:
            return ydb.Driver(endpoint=endpoint, database=database)
    except Exception as e:
        logger.warning(f"YDB init: {e}")
    return None


# --- API handlers ---

def api_init(params, body, headers):
    """GET /api/init — группы и упражнения"""
    # TODO: загрузка из YDB
    return json_response({'groups': [], 'exercises': []})


def api_history(params, body, headers):
    """GET /api/history?exercise_id=xxx"""
    exercise_id = params.get('exercise_id', [None])[0]
    if not exercise_id:
        return json_response({'error': 'Missing exercise_id'}, 400)
    # TODO: загрузка из YDB
    return json_response({'history': [], 'note': ''})


def api_global_history(params, body, headers):
    """GET /api/global_history — глобальная история тренировок"""
    try:
        driver = get_ydb_driver()
        if driver:
            # TODO: запрос к YDB для получения глобальной истории
            # result = ... driver.table_client ...
            pass
        return json_response([])
    except Exception as e:
        logger.error(f"api_global_history: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_save_set(params, body, headers):
    """POST /api/save_set"""
    try:
        data = json.loads(body) if body else {}
        # TODO: сохранение в YDB
        return json_response({'status': 'success', 'row_number': 1})
    except Exception as e:
        logger.error(f"api_save_set: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_update_set(params, body, headers):
    """POST /api/update_set"""
    try:
        data = json.loads(body) if body else {}
        # TODO: обновление в YDB
        return json_response({'status': 'success'})
    except Exception as e:
        logger.error(f"api_update_set: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_create_exercise(params, body, headers):
    """POST /api/create_exercise"""
    try:
        data = json.loads(body) if body else {}
        if not data.get('name') or not data.get('group'):
            return json_response({'error': 'Missing name or group'}, 400)
        # TODO: создание в YDB, вернуть созданный объект
        return json_response({'id': 'new-id', 'name': data['name'], 'muscleGroup': data['group']})
    except Exception as e:
        logger.error(f"api_create_exercise: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_update_exercise(params, body, headers):
    """POST /api/update_exercise"""
    try:
        data = json.loads(body) if body else {}
        if not data.get('id'):
            return json_response({'error': 'Missing id'}, 400)
        # TODO: обновление в YDB
        return json_response({'status': 'success'})
    except Exception as e:
        logger.error(f"api_update_exercise: {e}", exc_info=True)
        return json_response({'error': str(e)}, 500)


def api_ping(params, body, headers):
    """GET /api/ping"""
    return json_response({'status': 'ok'})


def api_analytics(params, body, headers):
    """GET /api/analytics?period=14"""
    period = int(params.get('period', [14])[0])
    # TODO: аналитика из YDB
    return json_response(None)


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


# CORS headers (для OPTIONS и ответов). Регистр заголовков может зависеть от платформы.
HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    'create_exercise': ('POST', api_create_exercise),
    'update_exercise': ('POST', api_update_exercise),
    'ping': ('GET', api_ping),
    'analytics': ('GET', api_analytics),
    'confirm_baseline': ('POST', api_confirm_baseline),
    'upload_image': ('POST', api_upload_image),
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
    auth_header = headers_lower.get('authorization', '').strip()
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
