// ВАЖНО: ссылка без слэша на конце (иначе CORS).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://functions.yandexcloud.net/d4errkd42gb1i7s41qsd').replace(/\/$/, '');

/**
 * Строит URL до API endpoint.
 *
 * Поддерживает 2 режима:
 * 1) Прямой backend (Render и т.п.): https://host/api/endpoint
 * 2) Yandex Cloud Function proxy: https://functions.yandexcloud.net/<id>?url=/api/endpoint
 */
export function buildApiUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint.replace(/^\/+/, '');
  const isYandexFunction = API_BASE_URL.includes('functions.yandexcloud.net');
  if (isYandexFunction) {
    return `${API_BASE_URL}?url=/api/${normalizedEndpoint}`;
  }
  return `${API_BASE_URL}/api/${normalizedEndpoint}`;
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
