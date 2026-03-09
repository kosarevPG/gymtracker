# GymTracker — Комплексный аудит и план рефакторинга

Senior Full-Stack + Lead UX/UI анализ проекта. Цель: нативное ощущение PWA, надёжность в зале при плохом интернете.

---

## 1. Архитектура, рефакторинг и PWA-специфика

### 1.1 Frontend (React/TypeScript)

#### Хуки — анализ и улучшения

**useWorkoutHistory** — минималистичен, но отсутствует:
- Кэширование (staleTime) — данные перезапрашиваются при каждом фокусе
- Обработка офлайн: при offline возвращается пустой массив, нет fallback на локальный кэш

```typescript
// Рекомендуемое улучшение useWorkoutHistory.ts
export function useWorkoutHistory() {
  const queryClient = useQueryClient();
  const { data: history = [], isLoading, isError, refetch } = useQuery({
    queryKey: GLOBAL_HISTORY_QUERY_KEY,
    queryFn: () => api.getGlobalHistory(),
    staleTime: 30_000,       // 30 сек — не перезапрашивать при переключении табов
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  const refreshHistory = () => queryClient.invalidateQueries({ queryKey: GLOBAL_HISTORY_QUERY_KEY });
  return { history, loading: isLoading, isError, refreshHistory };
}
```

**useLogSet** — `input_weight` передаётся неверно (должен быть `weight`, бэкенд ожидает `input_weight` в save_set). В update_set используется `weight`, что корректно. Проверка: schemas.py.

**useExerciseHistory** — не кэширует данные, при смене упражнения старые данные сбрасываются. Добавить `keepPreviousData: true` (или `placeholderData: keepPreviousData` в React Query v5) для плавного переключения.

#### Компоненты — оптимизация рендера

- **WorkoutCard**, **SetRow** — тяжёлые, пересчитывают PR, формулы веса при каждом рендере. Обернуть в `React.memo` с кастомным компаратором или вынести вычисления в `useMemo`.
- **HistoryWorkoutCard**, **HistoryExerciseGroup** — уже используют `memo`, хорошо.
- **App.tsx** — монолитный (1200+ строк). WorkoutScreen, SetRow, TimerBlock, модалки — всё в одном файле. Вынести:
  - `WorkoutScreen` → `screens/WorkoutScreen.tsx`
  - `SetRow`, `SetDisplayRow` логику — в `components/SetRow.tsx` (уже отдельно для SetDisplayRow)
  - Модалки (EditExercise, HistoryList, AddSuperset, Finish) — в `components/modals/`

#### Типизация

- `any` в WorkoutCard, SetRow, handleUpdateSet и др. Заменить на:
  - `ExerciseSessionData`, `WorkoutSet`, `(sid: string, field: string, value: string | number) => void`
- В `api.ts` возвращаемые типы размыты. Добавить интерфейсы для ответов API.

---

### 1.2 Офлайн-режим и Service Workers

#### Текущее состояние

- **offlineSync.ts**: очередь saveSet, updateSet, createExercise, updateExercise. При сетевой ошибке — addToQueue. При online — syncAll().
- **Проблемы**:
  1. `deleteSet` не в очереди — при офлайне удаление «теряется».
  2. Нет стратегии разрешения конфликтов (LWW убран на бэке).
  3. При syncAll — при ошибке операция остаётся в очереди с retryCount, но нет exponential backoff при повторных попытках.
  4. Нет индикации «частичной» синхронизации (например, 3 из 5).

#### Рекомендации

```typescript
// 1. Добавить deleteSet в очередь (с пометкой soft-delete на клиенте)
export type OperationType = 'saveSet' | 'updateSet' | 'deleteSet' | 'createExercise' | 'updateExercise';

// 2. В api.deleteSet — при сетевой ошибке:
return { status: 'queued', pending_id: addToQueue('deleteSet', { row_number: rowNumber }), offline: true };

// 3. В executeOperation добавить deleteSet
// 4. Интервал retry с backoff
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];
// При syncAll — использовать await new Promise(r => setTimeout(r, RETRY_DELAYS[op.retryCount]))
```

#### Service Worker и кэширование

- **vite.config.ts**: `globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']` — кэшируется статика. Хорошо.
- **navigateFallback**: `/gymtracker/index.html` — SPA fallback.
- **Рекомендации**:
  - Добавить `runtimeCaching` для API — стратегия `NetworkFirst` с fallback на кэш для `init`, `history`, `global_history` (при офлайне показывать закэшированные данные).
  - Иконка в manifest — внешний URL (flaticon). Заменить на локальный файл, чтобы работало офлайн.

```javascript
// vite.config.ts — runtimeCaching для Workbox
workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  navigateFallback: '/gymtracker/index.html',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\/api\/(init|history|global_history)/,
      handler: 'NetworkFirst',
      options: {
        networkTimeoutSeconds: 10,
        cacheName: 'api-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
      },
    },
  ],
},
```

---

### 1.3 Backend (Python) и YDB

#### Производительность

- **get_all_exercises()** — вызывается многократно (get_exercise_history, get_global_history, get_muscle_volume). Кэшировать в памяти с TTL 60 сек.
- **get_global_history** — `LIMIT 1500`, один большой SELECT. При росте данных — пагинация или курсор.
- **get_volume_load**, **get_muscle_volume** — LIMIT 2000–3000. Формат даты `YYYY.MM.DD` — сравнение строк, не индекс. Убедиться, что в YDB есть вторичный индекс по `date`.
- **export_logs_csv** — LIMIT 50000, синхронно. При больших объёмах — таймаут. Рассмотреть фоновую задачу или стриминг.

#### Оптимизация запросов

```python
# Кэш exercises (псевдокод)
_exercises_cache = None
_exercises_cache_ts = 0
EXERCISES_CACHE_TTL = 60

def get_all_exercises_cached():
    global _exercises_cache, _exercises_cache_ts
    if _exercises_cache and (time.time() - _exercises_cache_ts) < EXERCISES_CACHE_TTL:
        return _exercises_cache
    _exercises_cache = get_all_exercises()
    _exercises_cache_ts = time.time()
    return _exercises_cache
```

---

## 2. UX/UI и эргономика для PWA

### 2.1 Текущие недостатки

1. **Безопасные зоны**: StickyBottomBar использует `env(safe-area-inset-bottom)` — хорошо. Но `pb-28` у контейнера может быть недостаточно на iPhone с вырезом. Добавить `padding-bottom: env(safe-area-inset-bottom)` для body или main-контейнера.
2. **Прыгающий UI iOS**: При скролле Safari скрывает address bar — viewport меняется. Использовать `height: 100dvh` или `min-height: -webkit-fill-available` для стабильности.
3. **Кнопки**: `min-h-[48px]` есть не везде. Мелкие иконки (Pencil, Trash) — зона нажатия 48×48.
4. **HistorySetRow**: Три поля в ряд при редактировании — на узком экране тесно. Сетка как в SetRow.
5. **Haptic feedback**: Используется в HistorySetRow (save), но не в SetRow при complete. Добавить везде, где происходит «сохранение».

### 2.2 Улучшения флоу записи подхода

- **Быстрый ввод**: При нажатии Enter в поле веса — фокус на повторения. При Enter в повторениях — отметить подход выполненным (если вес и повт заполнены). Уже есть onBlur фокус на reps.
- **Swipe для удаления**: В HistorySetRow — свайп влево для удаления (с подтверждением).
- **Автосохранение при редактировании в истории**: Debounce 1.5 сек уже есть для updateSet. OK.

### 2.3 Конкретные правки

**index.css — безопасные зоны и viewport**:
```css
html {
  min-height: -webkit-fill-available;
}
body {
  min-height: 100vh;
  min-height: 100dvh;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
```

**Vibration API — централизованно**:
```typescript
// utils/haptics.ts
export const haptics = {
  light: () => navigator.vibrate?.(10),
  medium: () => navigator.vibrate?.(20),
  success: () => navigator.vibrate?.([20, 30, 20]),
  error: () => navigator.vibrate?.([50, 100, 50]),
};
// В SetRow onComplete — haptics.medium()
// В HistorySetRow handleSave — haptics.success()
```

---

## 3. Функциональные улучшения и аналитика

### 3.1 AnalyticsScreen — новые фичи

1. **Целевой вес (Target)**: Поле «Жим лёжа 100 кг» — прогресс-бар до цели, дата последнего PR.
2. **Тренд e1RM**: Показывать «↑ +5 кг за 2 недели» или «↓ -2 кг».
3. **Сравнение периодов**: «Тоннаж за 7 дней vs предыдущие 7 дней».
4. **График по группам мышц**: Разбивка тоннажа по мышцам во времени (stacked area).
5. **Напоминания**: «Ты не качал грудь 5 дней».

### 3.2 Клиентская аналитика (без бэкенда)

- **LocalStorage**: Хранить lastWorkoutDate, lastExerciseDates. Показывать «Неделя без ног» на HomeScreen.
- **IndexedDB** (опционально): Подробная история локально для быстрого доступа при офлайне.
- **Вычисление e1RM на клиенте**: Использовать историю из global_history или getHistory — строить график e1RM по упражнению без нового эндпоинта.

---

## 4. Roadmap — Пошаговый план

### Quick Wins (2–4 часа) ✅ ВЫПОЛНЕНО

| # | Задача | Статус |
|---|--------|--------|
| 1 | Haptic при complete подхода | Уже было в handleCompleteSet |
| 2 | Safe area в index.css | ✅ Добавлено |
| 3 | Локальная иконка PWA | ✅ icon-512.png в public |
| 4 | staleTime для useWorkoutHistory | ✅ staleTime: 30_000 |
| 5 | deleteSet в офлайн-очередь | ✅ addToQueue('deleteSet', {...}) |
| 6 | Типизация WorkoutCard props | ✅ WorkoutCardProps, HistoryGroup |

### Важные архитектурные изменения (на будущее)

| # | Задача | Сложность | Описание |
|---|--------|-----------|----------|
| 1 | Вынести WorkoutScreen из App.tsx | Средняя | `screens/WorkoutScreen.tsx`, перенести SetRow, TimerBlock, модалки |
| 2 | Runtime caching API в Workbox | Средняя | NetworkFirst для init, history, global_history |
| 3 | Кэш get_all_exercises на бэке | Низкая | In-memory кэш с TTL 60 сек |
| 4 | Целевой вес в AnalyticsScreen | Средняя | Новый блок «Цели», прогресс до target weight |
| 5 | Стратегия разрешения конфликтов | Высокая | Вернуть LWW с колонкой updated_at или CRDT для офлайн |
| 6 | Пагинация get_global_history | Средняя | Cursor-based или offset для больших объёмов |
| 7 | IndexedDB для офлайн-истории | Высокая | Локальная копия для быстрого доступа без сети |

---

## Краткие выводы

- **Сильные стороны**: PWA настроен, офлайн-очередь работает, StickyBottomBar с safe-area, memo для тяжёлых компонентов.
- **Слабые места**: Монолитный App.tsx, deleteSet не в очереди, нет runtime caching API, типизация any.
- **Приоритет**: Quick Wins → WorkoutScreen extraction → Runtime caching → Аналитика и цели.
