# Что нужно, чтобы на Yandex всё заработало (CORS и ошибки)

## 1. Триггер и CORS в консоли Yandex Cloud

- **Тип триггера:** HTTP (не Message Queue и не другой). URL функции вида `https://functions.yandexcloud.net/...` — это HTTP-триггер.
- **CORS в консоли:** В настройках триггера/функции иногда есть опция **«Разрешить CORS»** или **CORS** — включи её. Если OPTIONS не доходят до кода, префлайт обрабатывает сама платформа и без этой опции ответ будет без нужных заголовков.
- **Переменные окружения функции:** Задай `AUTH_TOKEN` (тот же пароль, что вводится на фронте). Если не задан — проверка пароля отключена (в коде: `if AUTH_TOKEN and ...`).

## 2. Код функции (уже есть в `back/index.py`)

- В начале handler: если метод **OPTIONS** — сразу возвращаем **200** и CORS-заголовки, **без проверки пароля**.
- В ответах: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization`.
- Метод берётся из `httpMethod`, `http_method` или `requestContext.http.method` (разные форматы Yandex).

После правок в коде в консоли Yandex нажми **«Создать версию»** / задеплой новую версию функции.

## 3. Фронт

- **URL бэкенда:** В `front/src/constants.ts` используется `API_BASE_URL` (без слэша в конце). Для продакшена при сборке подставляется `VITE_API_BASE_URL` — должен быть **ровно** URL твоей функции, например:
  `https://functions.yandexcloud.net/d4errkd42gb1i7s41qsd`
- Все запросы идут через `buildApiUrl(...)` (и в App.tsx, и в offlineSync) — без лишних слэшей и с кодированием `?url=/api/...` для proxy.

## 4. Проверка preflight с твоего компа

Подставь свой URL функции и домен фронта (GitHub Pages):

```bash
curl -i -X OPTIONS 'https://functions.yandexcloud.net/<ID_ФУНКЦИИ>?url=/api/ping' \
  -H 'Origin: https://kosarevpg.github.io' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Ожидаемо в ответе:

- `HTTP/1.1 200` (или 200 от Yandex)
- В заголовках: `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers: ... authorization ...`

Если 403/404/5xx или нет CORS-заголовков — OPTIONS либо не доходит до handler, либо блокируется настройками/платформой (см. п. 1).

## 5. Если ошибка остаётся

- **Жёсткое обновление страницы** (Ctrl+Shift+R) или инкогнито — исключить кэш.
- **Убедись, что фронт дергает именно Yandex:** в DevTools → Network смотри URL запросов (должен быть `functions.yandexcloud.net`).
- **Редиректы:** Preflight не должен получать 301/302 — иначе браузер может не выставить CORS-заголовки. URL функции должен быть без редиректа.
- **Прокси/CDN перед функцией:** Если есть Cloudflare, Nginx и т.п., они не должны резать или отвечать за OPTIONS сами без CORS-заголовков.

## 6. Кратко

1. В консоли Yandex: HTTP-триггер, CORS включён (если есть), задан `AUTH_TOKEN`, создана новая версия функции.  
2. Фронт: `VITE_API_BASE_URL` = URL функции без слэша в конце, сборка с этой переменной.  
3. Проверка: `curl -i -X OPTIONS '...'` с `Origin` и `Access-Control-Request-*` — в ответе 200 и CORS-заголовки.
