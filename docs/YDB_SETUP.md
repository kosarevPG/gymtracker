# Настройка YDB для GymTracker

## 1. Создание базы в Yandex Cloud

1. Откройте [Yandex Cloud Console](https://console.cloud.yandex.ru/)
2. Создайте Serverless базу YDB (или выберите существующую)
3. Скопируйте **Endpoint** (например `grpcs://ydb.serverless.yandexcloud.net:2135`) и **Database** (путь вида `/ru-central1/.../etn...`)

## 2. Переменные окружения в Cloud Function

В настройках функции добавьте:

| Переменная | Описание |
|------------|----------|
| `YDB_ENDPOINT` | Endpoint YDB (например `grpcs://ydb.serverless.yandexcloud.net:2135`) |
| `YDB_DATABASE` | Путь к базе (например `/ru-central1/b1g.../etn...`) |
| `YDB_METADATA_CREDENTIALS` | `1` — использовать service account функции (рекомендуется) |
| или `YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS` | Путь к JSON-ключу service account |
| `YDB_LOG_TABLE` | (опционально) Имя таблицы логов: `log` (по умолчанию) или `workout_logs` |

## 3. Права Service Account

Service account, от имени которого работает функция, должен иметь роль **ydb.editor** (или **ydb.admin**) на базу данных.

## 4. Деплой

Убедитесь, что в папке функции есть:
- `index.py`
- `ydb_store.py`
- `requirements.txt` с `ydb`

Таблицы `exercises` и `log` создаются автоматически при первом запросе.

**Совместимость:** код поддерживает разные схемы колонок. Если данные в `workout_logs`, задайте `YDB_LOG_TABLE=workout_logs`. Таблица `workout_logs` использует: `date_time` (вместо `date`), `sort_order` (вместо `ord`), без `exercise_name`.
