"""
Маршрутизация API. Декларативная регистрация эндпоинтов.
"""


def register_routes(handlers: dict) -> dict:
    """
    Регистрирует маршруты: endpoint -> (method, handler_fn).
    handler_fn(query_params, body, headers) -> response dict.
    """
    return {
        'init': ('GET', handlers['init']),
        'history': ('GET', handlers['history']),
        'global_history': ('GET', handlers['global_history']),
        'save_set': ('POST', handlers['save_set']),
        'update_set': ('POST', handlers['update_set']),
        'delete_set': ('POST', handlers['delete_set']),
        'create_exercise': ('POST', handlers['create_exercise']),
        'update_exercise': ('POST', handlers['update_exercise']),
        'ping': ('GET', handlers['ping']),
        'analytics': ('GET', handlers['analytics']),
        'confirm_baseline': ('POST', handlers['confirm_baseline']),
        'upload_image': ('POST', handlers['upload_image']),
        'start_session': ('POST', handlers['start_session']),
        'finish_session': ('POST', handlers['finish_session']),
        'export_csv': ('GET', handlers['export_csv']),
    }


def resolve_endpoint(url_param: str) -> str:
    """Извлекает endpoint из URL: /api/endpoint -> endpoint."""
    if '/api/' in url_param:
        return url_param.split('/api/')[-1].split('?')[0].strip('/')
    return 'ping'
