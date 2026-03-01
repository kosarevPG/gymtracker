// ВАЖНО: ссылка без слэша на конце (иначе CORS).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://functions.yandexcloud.net/d4errkd42gb1i7s41qsd').replace(/\/$/, '');

/**
 * Единый URL для API:
 * - direct backend: <BASE>/api/<endpoint>
 * - Yandex proxy: <BASE>?url=/api/<endpoint> (url кодируется через URLSearchParams).
 * endpoint нормализуется (без лидирующего /), query в endpoint сохраняется (history?exercise_id=...).
 */
export function buildApiUrl(endpoint: string): string {
  const normalized = endpoint.replace(/^\/+/, '');
  const base = API_BASE_URL;

  if (base.includes('functions.yandexcloud.net')) {
    const path = `/api/${normalized}`;
    const params = new URLSearchParams({ url: path });
    return `${base}?${params.toString()}`;
  }

  return `${base}/api/${normalized}`;
}

export const AUTH_TOKEN_KEY = 'gym_auth_token'; // <-- Пароль для базы

export const WORKOUT_STORAGE_KEY = 'gym_workout_state_v2';
export const EDIT_EXERCISE_DRAFT_KEY = 'gym_edit_exercise_draft';
export const SESSION_ID_KEY = 'gym_session_id';
export const ORDER_COUNTER_KEY = 'gym_order_counter';
export const LAST_ACTIVE_KEY = 'gym_last_active';

export const GROUP_ORDER = ['Спина', 'Ноги', 'Грудь', 'Плечи', 'Трицепс', 'Бицепс', 'Пресс', 'Кардио'];

export function sortGroups(groupsList: string[]): string[] {
  const sorted: string[] = [];
  const remaining = [...groupsList];
  GROUP_ORDER.forEach(groupName => {
    const index = remaining.indexOf(groupName);
    if (index !== -1) {
      sorted.push(groupName);
      remaining.splice(index, 1);
    }
  });
  sorted.push(...remaining);
  return sorted;
}
