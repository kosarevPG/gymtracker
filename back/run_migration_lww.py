#!/usr/bin/env python3
"""
Миграция LWW: добавление колонки updated_at в таблицу log для офлайн-синхронизации (Last Write Wins).
Позволяет обнаруживать конфликты при параллельном редактировании с нескольких устройств.

Запуск: YDB_ENDPOINT=... YDB_DATABASE=... YDB_METADATA_CREDENTIALS=1 python run_migration_lww.py
"""

import os
import sys


def get_credentials():
    import ydb
    if os.environ.get('YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS'):
        return ydb.iam.ServiceAccountCredentials.from_file(
            os.environ['YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS']
        )
    if os.environ.get('YDB_METADATA_CREDENTIALS') == '1':
        return ydb.iam.MetadataUrlCredentials()
    return ydb.credentials_from_env_variables()


def main():
    endpoint = (os.environ.get('YDB_ENDPOINT') or '').strip()
    database = (os.environ.get('YDB_DATABASE') or '').strip()
    if not endpoint or not database:
        print("Задайте YDB_ENDPOINT и YDB_DATABASE")
        sys.exit(1)

    try:
        import ydb
    except ImportError:
        print("Установите: pip install ydb")
        sys.exit(1)

    driver = ydb.Driver(
        endpoint=endpoint,
        database=database,
        credentials=get_credentials(),
    )
    driver.wait(timeout=30, fail_fast=True)
    pool = ydb.QuerySessionPool(driver)

    try:
        pool.execute_with_retries("ALTER TABLE log ADD COLUMN updated_at Timestamp;")
        print("OK: log.updated_at добавлена")
    except Exception as e:
        if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
            print("SKIP: log.updated_at уже есть")
        else:
            print(f"ERR: {e}")
            driver.stop()
            sys.exit(1)

    driver.stop()
    print("Миграция LWW завершена.")


if __name__ == '__main__':
    main()
