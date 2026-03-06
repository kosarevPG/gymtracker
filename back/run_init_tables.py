#!/usr/bin/env python3
"""
Создание таблиц YDB. Запускать при первом деплое или при развёртывании новой БД.
Не вызывается из Cloud Function — ускоряет cold start.

Запуск: YDB_ENDPOINT=... YDB_DATABASE=... YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS=... python run_init_tables.py
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

    tables = [
        ('exercises', """
            CREATE TABLE IF NOT EXISTS exercises (
                id Utf8,
                name Utf8,
                muscle_group Utf8,
                secondary_muscles Utf8,
                description Utf8,
                image_url Utf8,
                image_url2 Utf8,
                equipment_type Utf8,
                exercise_type Utf8,
                weight_type Utf8,
                base_weight Double,
                multiplier Double,
                body_weight_factor Double,
                PRIMARY KEY (id)
            );
        """),
        ('log', """
            CREATE TABLE IF NOT EXISTS log (
                id Utf8,
                date Utf8,
                exercise_id Utf8,
                exercise_name Utf8,
                input_weight Double,
                total_weight Double,
                reps Uint32,
                rest Double,
                set_group_id Utf8,
                session_id Utf8,
                note Utf8,
                ord Uint32,
                set_type Utf8,
                rpe Double,
                rir Uint32,
                is_low_confidence Bool,
                PRIMARY KEY (id)
            );
        """),
        ('sessions', """
            CREATE TABLE IF NOT EXISTS sessions (
                id Utf8,
                date Utf8,
                start_ts Timestamp,
                end_ts Timestamp,
                duration_sec Int32,
                srpe Double,
                body_weight Double,
                PRIMARY KEY (id)
            );
        """),
        ('exercise_muscles', """
            CREATE TABLE IF NOT EXISTS exercise_muscles (
                exercise_id Utf8,
                muscle_group Utf8,
                weight_factor Double,
                PRIMARY KEY (exercise_id, muscle_group)
            );
        """),
    ]

    for name, q in tables:
        try:
            pool.execute_with_retries(q)
            print(f"OK: {name}")
        except Exception as e:
            print(f"ERR {name}: {e}")
            driver.stop()
            sys.exit(1)

    driver.stop()
    print("Таблицы созданы.")


if __name__ == '__main__':
    main()
