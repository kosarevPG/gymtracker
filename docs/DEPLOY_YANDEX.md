# Деплой бэкенда на Yandex Cloud Function

## Автодеплой через GitHub Actions

При push в `main` (при изменении `back/`) workflow `deploy-yandex.yml` деплоит функцию.

## Необходимые секреты (GitHub → Settings → Secrets → Actions)

| Секрет | Описание |
|--------|----------|
| `YC_SA_JSON_CREDENTIALS` | JSON ключа Service Account (см. [документацию](https://cloud.yandex.ru/docs/iam/operations/authorized-key/create)) |
| `YC_BUCKET` | Имя бакета Object Storage для кода функции |
| `YC_FOLDER_ID` | ID каталога в Yandex Cloud (например `b1g...`) |
| `YC_FUNCTION_NAME` | Имя функции (опционально, по умолчанию `gymtracker-api`) |
| `YDB_ENDPOINT` | Endpoint YDB (например `grpcs://ydb.serverless.yandexcloud.net:2135`) |
| `YDB_DATABASE` | Путь к базе YDB |
| `AUTH_TOKEN` | Секретный токен для X-Auth-Token |

## Ручной запуск

Actions → Deploy Backend to Yandex Cloud Function → Run workflow
