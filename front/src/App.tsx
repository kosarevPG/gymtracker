import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AUTH_TOKEN_KEY, WORKOUT_STORAGE_KEY, sortGroups } from './constants';
import { initNetworkListeners } from './offlineSync';
import { api } from './api';
import { Button, Input, Modal } from './ui';
import { SyncStatusBadge } from './components/SyncStatusBadge';
import { EditExerciseModal } from './components/EditExerciseModal';
import type { Screen, Exercise } from './types';
import { HomeScreen, ExercisesListScreen, HistoryScreen, AnalyticsScreen, SettingsScreen, WorkoutScreen } from './screens';
import { useHaptics, useSession, useDebounce } from './hooks';

const App = () => {
  const { haptic, notify } = useHaptics();
  const { incrementOrder } = useSession();
  const [screen, setScreen] = useState<Screen>('home');
  const [groups, setGroups] = useState<string[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [exerciseToEdit, setExerciseToEdit] = useState<Exercise | null>(null);
  const sessionDataUpdaterRef = useRef<((id: string, updates: Partial<Exercise>) => void) | null>(null);
  const registerSessionDataUpdater = useCallback((fn: ((id: string, updates: Partial<Exercise>) => void) | null) => {
    sessionDataUpdaterRef.current = fn;
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState(!!(localStorage.getItem(AUTH_TOKEN_KEY) || '').trim());
  const [authInput, setAuthInput] = useState('');

  useEffect(() => {
    const onUnauthorized = () => setIsAuthenticated(false);
    window.addEventListener('gym-unauthorized', onUnauthorized);
    return () => window.removeEventListener('gym-unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (allExercises.length === 0) return;
    const saved = localStorage.getItem(WORKOUT_STORAGE_KEY);
    if (saved) {
        try {
            const session = JSON.parse(saved);
            const isFresh = session.timestamp && (Date.now() - session.timestamp) < 86400000;
            if (isFresh && session.activeExercises && session.activeExercises.length > 0) {
                const exId = session.activeExercises[0];
                const ex = allExercises.find((e: Exercise) => e.id === exId);
                if (ex) { setCurrentExercise(ex); setScreen('workout'); }
            } else { localStorage.removeItem(WORKOUT_STORAGE_KEY); }
        } catch { localStorage.removeItem(WORKOUT_STORAGE_KEY); }
    }
  }, [allExercises]);

  useEffect(() => { initNetworkListeners(); }, []);
  useEffect(() => {
    if (!isAuthenticated) return;
    const pingInterval = setInterval(() => { api.ping().catch(e => console.error(e)); }, 14 * 60 * 1000);
    api.ping().catch(e => console.error(e));
    return () => clearInterval(pingInterval);
  }, [isAuthenticated]);

  const { data: initData } = useQuery({
    queryKey: ['init'],
    queryFn: () => api.getInit(),
    enabled: isAuthenticated,
  });
  useEffect(() => {
    if (initData && initData.groups) {
      setGroups(sortGroups(initData.groups));
      setAllExercises(initData.exercises || []);
    }
  }, [initData]);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const filteredExercises = useMemo(() => {
    let list = allExercises;
    if (selectedGroup) list = list.filter(ex => ex.muscleGroup === selectedGroup);
    if (debouncedSearchQuery) list = list.filter(ex => ex.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()));
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
  }, [allExercises, selectedGroup, debouncedSearchQuery]);

  const queryClient = useQueryClient();
  const handleCreate = async () => {
      if (!newName || !newGroup) return;
      const newEx = await api.createExercise(newName, newGroup);
      if (newEx) {
        queryClient.invalidateQueries({ queryKey: ['init'] });
        setAllExercises(p => [...p, newEx]);
        setIsCreateModalOpen(false);
        setNewName('');
        setNewGroup('');
        notify('success');
        setExerciseToEdit(newEx);
      }
  };

  const handleUpdate = async (id: string, updates: Partial<Exercise>): Promise<boolean> => {
      setAllExercises(p => p.map(ex => ex.id === id ? { ...ex, ...updates } : ex));
      const result = await api.updateExercise(id, updates);
      if (result) {
          queryClient.invalidateQueries({ queryKey: ['init'] });
          const freshData = await api.getInit();
          if (freshData && freshData.exercises) setAllExercises(freshData.exercises);
          notify('success');
          return true;
      }
      notify('error');
      return false;
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-zinc-950 min-h-screen flex items-center justify-center p-4">
        <div className="bg-zinc-900 p-6 rounded-2xl w-full max-w-sm space-y-4">
          <h2 className="text-xl font-bold text-zinc-50 text-center">Вход в GymTracker</h2>
          <input
            type="password"
            placeholder="Секретный токен"
            value={authInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuthInput(e.target.value)}
            className="w-full h-12 bg-zinc-800 text-zinc-50 rounded-xl px-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            className="w-full h-12 bg-blue-600 text-white rounded-xl font-medium"
            onClick={() => {
              localStorage.setItem(AUTH_TOKEN_KEY, authInput);
              setIsAuthenticated(true);
            }}>Войти</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-950 min-h-screen text-zinc-50 font-sans selection:bg-blue-500/30 pt-12">
      <div className="fixed top-2 right-4 z-50">
        <SyncStatusBadge />
      </div>

      {screen === 'home' && <HomeScreen groups={groups} onSearch={(q: string) => { setSearchQuery(q); if(q) setScreen('exercises'); }} onSelectGroup={(g: string) => { setSelectedGroup(g); setScreen('exercises'); }} onAllExercises={() => { setSelectedGroup(null); setScreen('exercises'); }} onHistory={() => setScreen('history')} onAnalytics={() => setScreen('analytics')} onSettings={() => setScreen('settings')} searchQuery={searchQuery} />}
      {screen === 'analytics' && <AnalyticsScreen exercises={allExercises} onBack={() => setScreen('home')} />}
      {screen === 'history' && <HistoryScreen onBack={() => setScreen('home')} />}
      {screen === 'settings' && <SettingsScreen onBack={() => setScreen('home')} />}
      {screen === 'exercises' && <ExercisesListScreen exercises={filteredExercises} allExercises={allExercises} title={selectedGroup || (searchQuery ? `Поиск: ${searchQuery}` : 'Все упражнения')} searchQuery={searchQuery} onSearch={(q: string) => setSearchQuery(q)} onBack={() => { setSearchQuery(''); setSelectedGroup(null); setScreen('home'); }} onSelectExercise={(ex: Exercise) => { haptic('light'); setCurrentExercise(ex); setScreen('workout'); }} onAddExercise={() => setIsCreateModalOpen(true)} />}
      {screen === 'workout' && currentExercise && <WorkoutScreen initialExercise={currentExercise} allExercises={allExercises} incrementOrder={incrementOrder} haptic={haptic} notify={notify} onBack={() => setScreen('exercises')} setExerciseToEdit={setExerciseToEdit} registerSessionDataUpdater={registerSessionDataUpdater} />}

      {exerciseToEdit && (
        <EditExerciseModal
          isOpen={!!exerciseToEdit}
          onClose={() => setExerciseToEdit(null)}
          exercise={exerciseToEdit}
          groups={[...new Set(allExercises.map((e: Exercise) => e.muscleGroup).filter(Boolean))].sort() as string[]}
          onSave={async (id, updates) => {
            const ok = await handleUpdate(id, updates);
            if (ok) sessionDataUpdaterRef.current?.(id, updates);
          }}
        />
      )}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Новое упражнение">
         <div className="space-y-4">
             <div><label className="text-sm text-zinc-400 mb-1 block">Название</label><Input value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)} placeholder="Например: Отжимания" /></div>
             <div><label className="text-sm text-zinc-400 mb-1 block">Группа</label><div className="flex flex-wrap gap-2">{groups.map(g => <button key={g} onClick={() => setNewGroup(g)} className={`px-3 py-2 rounded-xl text-sm border ${newGroup === g ? 'bg-blue-600 border-blue-600 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>{g}</button>)}</div></div>
             <Button onClick={handleCreate} className="w-full h-12 mt-4">Создать</Button>
         </div>
      </Modal>
    </div>
  );
};

export default App;
