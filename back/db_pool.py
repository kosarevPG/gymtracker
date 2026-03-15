"""
Управление подключением к YDB: credentials, driver, пул сессий.
"""

import logging
import os

logger = logging.getLogger(__name__)

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
