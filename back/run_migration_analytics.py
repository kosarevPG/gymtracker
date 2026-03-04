#!/usr/bin/env python3
"""
Миграция YDB: добавление колонок для аналитики (set_type, rpe, rir, secondary_muscles).
Запуск: YDB_ENDPOINT=... YDB_DATABASE=... YDB_METADATA_CREDENTIALS=1 python run_migration_analytics.py
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
    ops = [
        ('exercises.secondary_muscles', 'ALTER TABLE exercises ADD COLUMN secondary_muscles Utf8;'),
        ('log.set_type', 'ALTER TABLE log ADD COLUMN set_type Utf8;'),
        ('log.rpe', 'ALTER TABLE log ADD COLUMN rpe Double;'),
        ('log.rir', 'ALTER TABLE log ADD COLUMN rir Uint32;'),
        ('log.session_id', 'ALTER TABLE log ADD COLUMN session_id Utf8;'),
        ('log.is_low_confidence', 'ALTER TABLE log ADD COLUMN is_low_confidence Bool;'),
        ('workout_logs.set_type', 'ALTER TABLE workout_logs ADD COLUMN set_type Utf8;'),
        ('workout_logs.rpe', 'ALTER TABLE workout_logs ADD COLUMN rpe Double;'),
        ('workout_logs.rir', 'ALTER TABLE workout_logs ADD COLUMN rir Uint32;'),
        ('workout_logs.session_id', 'ALTER TABLE workout_logs ADD COLUMN session_id Utf8;'),
        ('workout_logs.is_low_confidence', 'ALTER TABLE workout_logs ADD COLUMN is_low_confidence Bool;'),
    ]

    for name, q in ops:
        try:
            pool.execute_with_retries(q)
            print(f"OK: {name}")
        except Exception as e:
            err = str(e).lower()
            if 'already exists' in err or 'duplicate' in err or 'exists' in err:
                print(f"SKIP (уже есть): {name}")
            elif 'not found' in err or 'unknown' in err:
                print(f"SKIP (таблица отсутствует): {name}")
            else:
                print(f"ERR {name}: {e}")

    driver.stop()
    print("Миграция завершена.")

if __name__ == '__main__':
    main()
