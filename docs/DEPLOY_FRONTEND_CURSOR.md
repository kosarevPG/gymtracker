# Деплой фронта (памятка для Cursor / разработчиков)

## Как запускается деплой

- **Автодеплой фронта** срабатывает **только**:
  1. при **push в `main`** (если затронуты `front/**` или `.github/workflows/deploy-frontend.yml`);
  2. или **вручную** через **workflow_dispatch** в GitHub Actions (Actions → Deploy Frontend to GitHub Pages → Run workflow).

- В CI при **build** используется **`VITE_API_BASE_URL`** из **секрета репозитория** (Settings → Secrets → Actions); если секрет не задан — в workflow указан fallback (например `https://gym-logger-bot-y602.onrender.com`). См. `.github/workflows/deploy-frontend.yml`, шаг Build, `env.VITE_API_BASE_URL`.

## Зачем так сделано (CORS и URL)

- **`buildApiUrl`** в proxy-режиме (Yandex) **обязан** кодировать параметр `url` через **URLSearchParams**, иначе endpoint'ы с query ломаются:
  - `history?exercise_id=...`
  - `analytics?period=...`
- Итог: один helper для двух режимов — **direct backend** (`<BASE>/api/<endpoint>`) и **Yandex proxy** (`<BASE>?url=/api/<endpoint>` с кодированием).

## Что проверять в PR

- Все ключевые **fetch**-вызовы идут **через `buildApiUrl`**:
  - в **App.tsx**: `api.request(endpoint)`, `save_set`, `update_set`, `upload_image`;
  - в **offlineSync.ts**: `executeOperation` использует `buildApiUrl(endpoints[op.type])`.
- Не должно быть «голых» URL вида `${API_BASE_URL}/api/...` или `${API_BASE_URL}?url=...` без helper'а.

## Команды для проверки (локально)

```bash
git log --oneline -n 3
nl -ba front/src/constants.ts | sed -n '1,80p'
nl -ba front/src/App.tsx | sed -n '84,160p'
nl -ba front/src/offlineSync.ts | sed -n '126,146p'
nl -ba .github/workflows/deploy-frontend.yml | sed -n '1,52p'
```

Используй их, чтобы убедиться в актуальности констант, API-слоя, офлайн-синка и workflow.
