#!/usr/bin/env python3
"""
Миграция YDB: добавление вторичных индексов для log.
Ускоряет запросы WHERE date >= ... и WHERE exercise_id = ...

Запуск: YDB_ENDPOINT=... YDB_DATABASE=... YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS=... python run_migration_indexes.py
"""

import os
import sys


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

    def get_credentials():
        if os.environ.get('YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS'):
            return ydb.iam.ServiceAccountCredentials.from_file(
                os.environ['YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS']
            )
        if os.environ.get('YDB_METADATA_CREDENTIALS') == '1':
            return ydb.iam.MetadataUrlCredentials()
        return ydb.credentials_from_env_variables()

    driver = ydb.Driver(
        endpoint=endpoint,
        database=database,
        credentials=get_credentials(),
    )
    driver.wait(timeout=30, fail_fast=True)
    pool = ydb.QuerySessionPool(driver)

    indexes = [
        ('log.idx_date', 'ALTER TABLE log ADD INDEX idx_date GLOBAL ASYNC ON (date);'),
        ('log.idx_exercise_date', 'ALTER TABLE log ADD INDEX idx_exercise_date GLOBAL ASYNC ON (exercise_id, date);'),
    ]

    for name, q in indexes:
        try:
            pool.execute_with_retries(q)
            print(f"OK: {name}")
        except Exception as e:
            err = str(e).lower()
            if 'already exists' in err or 'duplicate' in err:
                print(f"SKIP (уже есть): {name}")
            else:
                print(f"ERR {name}: {e}")

    driver.stop()
    print("Миграция индексов завершена. Индексы строятся асинхронно.")


if __name__ == '__main__':
    main()
