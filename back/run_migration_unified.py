#!/usr/bin/env python3
"""
Миграция YDB: объединение log и workout_logs в единую таблицу log (snake_case).
- Добавляет exercise_name в workout_logs (если есть)
- Создаёт log_new, копирует данные из log и workout_logs
- Удаляет log и workout_logs, переименовывает log_new в log

Запуск: YDB_ENDPOINT=... YDB_DATABASE=... YDB_METADATA_CREDENTIALS=1 python run_migration_unified.py
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


def table_exists(pool, name: str) -> bool:
    """Проверяет существование таблицы."""
    try:
        pool.execute_with_retries(f"SELECT 1 FROM {name} LIMIT 1;")
        return True
    except Exception:
        return False


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

    log_exists = table_exists(pool, 'log')
    workout_logs_exists = table_exists(pool, 'workout_logs')

    if not log_exists and not workout_logs_exists:
        print("Таблицы log и workout_logs не найдены. Создаём log с целевой схемой.")
        pool.execute_with_retries("""
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
        """)
        print("OK: log создана")
        driver.stop()
        return

    # 1. Добавить exercise_name в workout_logs
    if workout_logs_exists:
        try:
            pool.execute_with_retries("ALTER TABLE workout_logs ADD COLUMN exercise_name Utf8;")
            print("OK: workout_logs.exercise_name добавлена")
        except Exception as e:
            if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
                print("SKIP: workout_logs.exercise_name уже есть")
            else:
                print(f"ERR workout_logs.exercise_name: {e}")
                driver.stop()
                sys.exit(1)

    # 2. Создать log_new
    pool.execute_with_retries("""
        CREATE TABLE log_new (
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
    """)
    print("OK: log_new создана")

    # 3. Копировать из log
    if log_exists:
        try:
            pool.execute_with_retries("""
                INSERT INTO log_new (id, date, exercise_id, exercise_name, input_weight, total_weight, reps, rest, set_group_id, session_id, note, ord, set_type, rpe, rir, is_low_confidence)
                SELECT id, date, exercise_id, COALESCE(exercise_name, ""), input_weight, total_weight, reps, rest, set_group_id, session_id, note, ord, COALESCE(set_type, "working"), rpe, rir, COALESCE(is_low_confidence, false)
                FROM log;
            """)
            print("OK: данные скопированы из log")
        except Exception as e:
            print(f"ERR копирование из log: {e}")
            driver.stop()
            sys.exit(1)

    # 4. Копировать из workout_logs (date_time -> date, sort_order -> ord)
    if workout_logs_exists:
        try:
            pool.execute_with_retries("""
                UPSERT INTO log_new (id, date, exercise_id, exercise_name, input_weight, total_weight, reps, rest, set_group_id, session_id, note, ord, set_type, rpe, rir, is_low_confidence)
                SELECT id,
                    Unicode::Substring(COALESCE(date_time, ""), 0, 10),
                    exercise_id,
                    COALESCE(exercise_name, ""),
                    input_weight, total_weight, reps, rest, set_group_id, session_id, note,
                    COALESCE(sort_order, 0),
                    COALESCE(set_type, "working"),
                    rpe, rir,
                    COALESCE(is_low_confidence, false)
                FROM workout_logs;
            """)
            print("OK: данные скопированы из workout_logs")
        except Exception as e:
            print(f"ERR копирование из workout_logs: {e}")
            driver.stop()
            sys.exit(1)

    # 5. Удалить log и workout_logs
    if log_exists:
        pool.execute_with_retries("DROP TABLE log;")
        print("OK: log удалена")
    if workout_logs_exists:
        pool.execute_with_retries("DROP TABLE workout_logs;")
        print("OK: workout_logs удалена")

    # 6. Переименовать log_new в log
    pool.execute_with_retries("ALTER TABLE log_new RENAME TO log;")
    print("OK: log_new переименована в log")

    driver.stop()
    print("Миграция завершена. Удалите YDB_LOG_TABLE из переменных окружения.")


if __name__ == '__main__':
    main()
