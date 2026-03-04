import { AUTH_TOKEN_KEY, buildApiUrl } from './constants';
import { cacheExercises, getCachedExercises, addToQueue } from './offlineSync';
import type { Exercise } from './types';

export const getToken = () => localStorage.getItem(AUTH_TOKEN_KEY) || '';

/** При 403 сбрасываем токен и показываем экран входа */
export function handle403() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent('gym-unauthorized'));
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

  saveSet: async (data: Record<string, unknown>): Promise<{ status?: string; row_number?: number; pending_id?: string; offline?: boolean } | null> => {
    try {
      const res = await fetch(buildApiUrl('save_set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
        body: JSON.stringify(data)
      });
      if (res.status === 403) { handle403(); return null; }
      if (res.ok) return await res.json();
    } catch (e) { console.log('saveSet failed', e); }
    return { status: 'queued', pending_id: addToQueue('saveSet', data), offline: true };
  },

  updateSet: async (data: Record<string, unknown>): Promise<{ status?: string; pending_id?: string; offline?: boolean } | null> => {
    try {
      const res = await fetch(buildApiUrl('update_set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
        body: JSON.stringify(data)
      });
      if (res.status === 403) { handle403(); return null; }
      if (res.ok) return await res.json();
    } catch (e) { console.log('updateSet failed', e); }
    return { status: 'queued', pending_id: addToQueue('updateSet', data), offline: true };
  },

  deleteSet: async (rowNumber: string): Promise<{ status?: string } | null> => {
    try {
      const res = await fetch(buildApiUrl('delete_set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
        body: JSON.stringify({ row_number: rowNumber })
      });
      if (res.status === 403) { handle403(); return null; }
      if (res.ok) return await res.json();
    } catch (e) { console.log('deleteSet failed', e); }
    return null;
  },

  createExercise: async (name: string, group: string) => await api.request('create_exercise', { method: 'POST', body: JSON.stringify({ name, group }) }),
  updateExercise: async (id: string, updates: Partial<Exercise>) => await api.request('update_exercise', { method: 'POST', body: JSON.stringify({ id, updates }) }),
  ping: async () => await api.request('ping'),
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
  }
};
