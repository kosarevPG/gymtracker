# Миграция схемы YDB для аналитики

## Автоматическая миграция (Python)

```bash
cd Archive/back
export YDB_ENDPOINT="grpcs://ydb.serverless.yandexcloud.net:2135"
export YDB_DATABASE="/ru-central1/..."
export YDB_METADATA_CREDENTIALS=1  # для Cloud Function / VM
# или YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS=/path/to/key.json

python run_migration_analytics.py
```

## Ручная миграция (YDB Console)

Если таблицы уже существуют, выполните в YDB Console или через CLI:

## exercises

```sql
ALTER TABLE exercises ADD COLUMN secondary_muscles Utf8;
```

Примечание: `multiplier` изменён с Uint32 на Double в CREATE TABLE. Для существующих таблиц _to_float в get_all_exercises корректно обработает целые значения. Для дробных (0.68) потребуется миграция данных в новую колонку.

## log / workout_logs

```sql
ALTER TABLE log ADD COLUMN set_type Utf8;
ALTER TABLE log ADD COLUMN rpe Double;
ALTER TABLE log ADD COLUMN rir Uint32;
```

Для `workout_logs` (если используется YDB_LOG_TABLE=workout_logs):

```sql
ALTER TABLE workout_logs ADD COLUMN set_type Utf8;
ALTER TABLE workout_logs ADD COLUMN rpe Double;
ALTER TABLE workout_logs ADD COLUMN rir Uint32;
```

## Объединение log и workout_logs (единая схема)

Скрипт `run_migration_unified.py` объединяет `log` и `workout_logs` в единую таблицу `log` со схемой snake_case. После миграции поддержка `workout_logs` удалена.

```bash
python run_migration_unified.py
```

Перед запуском выполните `run_migration_analytics.py` (добавление колонок). После миграции удалите `YDB_LOG_TABLE` из переменных окружения и перезадеплойте Cloud Function.
