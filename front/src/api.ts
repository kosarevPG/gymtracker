import { AUTH_TOKEN_KEY, buildApiUrl } from './constants';
import { cacheExercises, getCachedExercises, addToQueue, type OperationType } from './offlineSync';
import type { Exercise } from './types';

export const getToken = () => localStorage.getItem(AUTH_TOKEN_KEY) || '';

/** При 403 сбрасываем токен и показываем экран входа */
export function handle403() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent('gym-unauthorized'));
}

/** Общий хелпер для мутаций: fetch + 403 + 409 + offline fallback */
async function mutationRequest<T = Record<string, unknown>>(
  endpoint: string,
  data: Record<string, unknown>,
  options?: { offlineType?: OperationType; addTimestamp?: boolean }
): Promise<T | null> {
  try {
    const payload = { ...data };
    if (options?.addTimestamp && !payload.updated_at) {
      payload.updated_at = new Date().toISOString();
    }
    const res = await fetch(buildApiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
      body: JSON.stringify(payload)
    });
    if (res.status === 403) { handle403(); return null; }
    if (res.status === 409) {
      const err = await res.json().catch(() => ({}));
      return { status: 'conflict', code: 'CONFLICT', error: err?.error || 'Конфликт' } as T;
    }
    if (res.ok) return await res.json();
  } catch (e) {
    console.log(`${endpoint} failed`, e);
  }
  if (options?.offlineType) {
    return { status: 'queued', pending_id: addToQueue(options.offlineType, data), offline: true } as T;
  }
  return null;
}

export const api = {
  request: async (endpoint: string, options: RequestInit = {}) => {
    try {
      const url = endpoint.startsWith('http') ? endpoint : buildApiUrl(endpoint);
      const res = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken(), ...options.headers }
      });
      if (res.status === 403) { handle403(); return null; }
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) { console.error(e); return null; }
  },

  getInit: async () => {
    try {
      const data = await api.request('init');
      if (data && data.exercises) { cacheExercises(data); return data; }
    } catch (e) { console.error('getInit failed:', e); }
    const cached = getCachedExercises();
    if (cached) return cached;
    return { groups: [], exercises: [] };
  },

  getHistory: async (exerciseId: string) => await api.request(`history?exercise_id=${exerciseId}`) || { history: [], note: '' },
  getGlobalHistory: async () => await api.request('global_history') || [],
  getAnalytics: async (period: number = 14) => await api.request(`analytics?period=${period}`) || null,

  confirmBaseline: async (proposalId: string, action: 'CONFIRM' | 'SNOOZE' | 'DECLINE') =>
    await api.request('confirm_baseline', { method: 'POST', body: JSON.stringify({ proposalId, action }) }),

  saveSet: (data: Record<string, unknown>) =>
    mutationRequest<{ status?: string; row_number?: number; updated_at?: string; pending_id?: string; offline?: boolean; code?: string; error?: string }>('save_set', data, { offlineType: 'saveSet', addTimestamp: true }),

  updateSet: (data: Record<string, unknown>) =>
    mutationRequest<{ status?: string; pending_id?: string; offline?: boolean; code?: string; error?: string }>('update_set', data, { offlineType: 'updateSet', addTimestamp: true }),

  deleteSet: (rowNumber: string) =>
    mutationRequest<{ status?: string; pending_id?: string; offline?: boolean }>('delete_set', { row_number: rowNumber }, { offlineType: 'deleteSet' }),

  createExercise: async (name: string, group: string) => await api.request('create_exercise', { method: 'POST', body: JSON.stringify({ name, group }) }),
  updateExercise: async (id: string, updates: Partial<Exercise>) => await api.request('update_exercise', { method: 'POST', body: JSON.stringify({ id, updates }) }),
  ping: async () => await api.request('ping'),

  startSession: (bodyWeight?: number) =>
    mutationRequest('start_session', { body_weight: bodyWeight ?? 0 }),

  finishSession: (data: { session_id: string; srpe?: number; body_weight?: number }) =>
    mutationRequest('finish_session', { session_id: data.session_id, srpe: data.srpe ?? 0, body_weight: data.body_weight ?? 0 }),

  uploadImage: async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch(buildApiUrl('upload_image'), {
        method: 'POST', headers: { 'X-Auth-Token': getToken() }, body: formData
      });
      if (res.status === 403) { handle403(); return null; }
      if (!res.ok) throw new Error('Upload failed');
      return await res.json();
    } catch (e) { return null; }
  },

  exportCsv: async (): Promise<boolean> => {
    try {
      const res = await fetch(buildApiUrl('export_csv'), {
        method: 'GET',
        headers: { 'X-Auth-Token': getToken() }
      });
      if (res.status === 403) { handle403(); return false; }
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const csvBase64 = data?.csv;
      if (!csvBase64 || typeof csvBase64 !== 'string') throw new Error('Invalid export response');
      const binary = atob(csvBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gymtracker_export.csv';
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      console.error('exportCsv failed:', e);
      return false;
    }
  }
};
