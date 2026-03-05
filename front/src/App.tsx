import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Search, Plus, Check, Trash2, StickyNote, ChevronDown, Calendar, 
  Pencil, Trophy, Link as LinkIcon,
  Cloud, CloudOff, RefreshCw
} from 'lucide-react';
import { getWeightInputType, calcEffectiveWeight, WEIGHT_FORMULAS, BODY_WEIGHT_DEFAULT, WEIGHT_TYPES, allows1rm } from './exerciseConfig';
import { AUTH_TOKEN_KEY, WORKOUT_STORAGE_KEY, SESSION_ID_KEY, ORDER_COUNTER_KEY, LAST_ACTIVE_KEY, EDIT_EXERCISE_DRAFT_KEY, sortGroups } from './constants';
import { createEmptySet, createSetFromHistory } from './utils';
import { SetDisplayRow } from './components/SetDisplayRow';
import { ImageUploadSlot } from './components/ImageUploadSlot';
import { motion, AnimatePresence } from 'framer-motion';
import { subscribeToStatus, initNetworkListeners, syncAll, type SyncStatus } from './offlineSync';
import { api } from './api';
import { Card, Button, Input, Modal, StickyBottomBar } from './ui';
import type { Screen, Exercise, WorkoutSet, ExerciseSessionData } from './types';
import { HomeScreen, ExercisesListScreen, HistoryScreen, AnalyticsScreen, SettingsScreen } from './screens';
import { useExerciseHistory } from './hooks';

// --- HOOKS ---

const useHaptics = () => {
  const haptic = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
    if (!navigator.vibrate) return;
    if (style === 'light') navigator.vibrate(10);
    else if (style === 'medium') navigator.vibrate(20);
    else navigator.vibrate(40);
  };
  
  const notify = (type: 'error' | 'success' | 'warning') => {
    if (!navigator.vibrate) return;
    
    // Теперь переменная type используется для разных паттернов вибрации
    if (type === 'error') {
      navigator.vibrate([50, 100, 50, 100, 50]); 
    } else if (type === 'warning') {
      navigator.vibrate([30, 50, 30]);
    } else {
      navigator.vibrate([20, 30, 20]); // success
    }
  };
  
  return { haptic, notify };
};

const useTimer = () => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<any>(null);

  const start = () => {
    if (isRunning) return;
    setIsRunning(true);
    const startTime = Date.now() - time;
    intervalRef.current = setInterval(() => setTime(Date.now() - startTime), 50);
  };
  const pause = () => {
    setIsRunning(false);
    clearInterval(intervalRef.current);
  };
  const reset = () => {
    setIsRunning(false);
    clearInterval(intervalRef.current);
    setTime(0);
  };
  const resetAndStart = () => {
    // Сначала останавливаем и очищаем
    clearInterval(intervalRef.current);
    setTime(0);
    // Затем сразу запускаем
    setIsRunning(true);
    const startTime = Date.now();
    intervalRef.current = setInterval(() => setTime(Date.now() - startTime), 50);
  };
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    const ms2 = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
    return `${m}:${s}.${ms2}`;
  };
  return { time, isRunning, start, pause, reset, resetAndStart, formatTime };
};

// Хук для debounce значения
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const useSession = () => {
  const [sessionId, setSessionId] = useState('');
  const orderCounterRef = useRef(0);

  useEffect(() => {
    const lastActive = localStorage.getItem(LAST_ACTIVE_KEY);
    const savedSession = localStorage.getItem(SESSION_ID_KEY);
    const savedOrder = localStorage.getItem(ORDER_COUNTER_KEY);
    const now = Date.now();

    if (!lastActive || (now - parseInt(lastActive)) > 14400000 || !savedSession) {
      const newId = crypto.randomUUID();
      setSessionId(newId);
      orderCounterRef.current = 0;
      localStorage.setItem(SESSION_ID_KEY, newId);
    } else {
      orderCounterRef.current = parseInt(savedOrder || '0');
      setSessionId(savedSession);
    }
    localStorage.setItem(LAST_ACTIVE_KEY, now.toString());
  }, []);

  const incrementOrder = () => {
    orderCounterRef.current += 1;
    const next = orderCounterRef.current;
    localStorage.setItem(ORDER_COUNTER_KEY, next.toString());
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    return next;
  };
  return { sessionId, incrementOrder };
};

// --- SYNC STATUS COMPONENT ---

const SyncStatusBadge = () => {
  const [status, setStatus] = useState<SyncStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToStatus((newStatus, count) => {
      setStatus(newStatus);
      setPendingCount(count);
      setIsSyncing(newStatus === 'syncing');
    });
    return unsubscribe;
  }, []);

  const handleSync = async () => {
    if (pendingCount > 0 && !isSyncing) {
      setIsSyncing(true);
      await syncAll();
      setIsSyncing(false);
    }
  };

  // Не показываем ничего если онлайн и нет pending
  if (status === 'online' && pendingCount === 0) {
    return null;
  }

  return (
    <button
      onClick={handleSync}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
        status === 'offline' 
          ? 'bg-red-500/20 text-red-400' 
          : pendingCount > 0 
            ? 'bg-yellow-500/20 text-yellow-400' 
            : 'bg-green-500/20 text-green-400'
      }`}
    >
      {isSyncing ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      ) : status === 'offline' ? (
        <CloudOff className="w-3.5 h-3.5" />
      ) : (
        <Cloud className="w-3.5 h-3.5" />
      )}
      {pendingCount > 0 && <span>{pendingCount}</span>}
      {status === 'offline' && <span>Офлайн</span>}
    </button>
  );
};

// --- FEATURES ---

const TimerBlock = ({ timer, onToggle, sessionTonnage = 0 }: any) => {
  const minutes = timer.time / 60;
  const density = minutes > 0 ? Math.round(sessionTonnage / minutes) : 0;
  return (
    <div className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md pb-4 pt-2 px-4 border-b border-zinc-800/50 mb-4">
      <Card className="flex items-center justify-between p-3 px-5 shadow-xl shadow-black/50">
        <div>
          <div className="font-mono text-3xl font-bold tracking-wider text-zinc-50 tabular-nums">{timer.formatTime(timer.time)}</div>
          {sessionTonnage > 0 && <div className="text-xs text-zinc-500 mt-1">Плотность: {density} кг/мин</div>}
        </div>
        <div className="flex gap-2">
          <Button variant={timer.isRunning ? "danger" : "primary"} onClick={onToggle} className="w-20 h-10 text-sm">{timer.isRunning ? "Стоп" : "Старт"}</Button>
        </div>
      </Card>
    </div>
  );
};

const NoteWidget = ({ initialValue, onChange }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);

  return (
    <div className="mb-4">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 text-yellow-500 text-sm font-medium mb-2 w-full">
        <StickyNote className="w-4 h-4" /><span>Заметка</span><ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <textarea value={value} onChange={(e) => { setValue(e.target.value); onChange(e.target.value); }} placeholder="Настройки..." className="w-full bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-yellow-200 text-sm focus:outline-none min-h-[80px]" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const HistoryListModal = ({ isOpen, onClose, exerciseId, exerciseName }: { isOpen: boolean; onClose: () => void; exerciseId: string | null; exerciseName: string }) => {
  const { history } = useExerciseHistory(isOpen ? exerciseId : null);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`История: ${exerciseName}`}>
      <div className="space-y-6">
        {history.map((group: any, idx: number) => {
          if (group.isSuperset && group.exercises) {
            // Отображаем суперсет со всеми упражнениями
            return (
              <div key={idx}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-zinc-900 py-1 z-10">
                  <Calendar className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{group.date}</span>
                </div>
                <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-3 pt-3 pb-1 text-xs text-blue-400 font-bold flex items-center">
                    <LinkIcon className="w-3 h-3 mr-1" /> СУПЕРСЕТ
                  </div>
                  {group.exercises.map((ex: any, exIdx: number) => (
                    <div key={exIdx}>
                      {exIdx > 0 && <div className="border-t border-zinc-800/50" />}
                      <div className="px-3 pt-2 pb-1 text-sm font-medium text-zinc-300">
                        {ex.exerciseName}
                      </div>
                      {ex.sets.map((set: any, setIdx: number) => {
                        const isLastSet = setIdx === ex.sets.length - 1;
                        const isLastExercise = exIdx === group.exercises.length - 1;
                        const borderClass = isLastSet && isLastExercise ? '' : 'border-b border-zinc-800/50';
                        return (
                          <SetDisplayRow key={setIdx} weight={set.weight} reps={set.reps} rest={set.rest} className={`py-2 px-3 border-l-2 border-l-blue-500 bg-blue-500/5 ${borderClass}`} />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          } else {
            // Обычные подходы (не в суперсете)
            return (
              <div key={idx}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-zinc-900 py-1 z-10">
                  <Calendar className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{group.date}</span>
                </div>
                <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl overflow-hidden">
                  {group.sets.map((set: any, setIdx: number) => {
                    const isLastSet = setIdx === group.sets.length - 1;
                    return (
                      <SetDisplayRow key={setIdx} weight={set.weight} reps={set.reps} rest={set.rest} className={`py-2 px-3 ${isLastSet ? '' : 'border-b border-zinc-800/50'}`} />
                    );
                  })}
                </div>
              </div>
            );
          }
        })}
        {history.length === 0 && <div className="text-center text-zinc-500 py-10">История пуста</div>}
      </div>
    </Modal>
  );
};

const SET_TYPE_ORDER: Array<'warmup' | 'working' | 'drop' | 'failure'> = ['warmup', 'working', 'drop', 'failure'];
const SET_TYPE_LABEL: Record<string, string> = { warmup: 'W', working: 'R', drop: 'D', failure: 'F' };

const SetRow = ({ set, equipmentType, weightType: weightTypeFromRef, baseWeight, weightMultiplier, bodyWeightFactor, onUpdate, onDelete, onComplete, onToggleEdit }: { set: any; equipmentType?: string; weightType?: string; baseWeight?: number; weightMultiplier?: number; bodyWeightFactor?: number; onUpdate: (sid: string, field: string, value: string | number) => void; onDelete: (sid: string) => void; onComplete: (sid: string) => void; onToggleEdit: (sid: string) => void }) => {
  const repsRef = useRef<HTMLInputElement>(null);
  const weightType = getWeightInputType(equipmentType, weightTypeFromRef);
  const formula = WEIGHT_FORMULAS[weightType];
  const effectiveWeight = calcEffectiveWeight(set.weight || '', weightType, undefined, baseWeight, weightMultiplier, bodyWeightFactor);
  const displayWeight = set.completed ? (set.effectiveWeight ?? (parseFloat(set.weight) || 0)) : (effectiveWeight ?? (parseFloat(set.weight) || 0));
  const show1rm = allows1rm(weightType);
  const oneRM = show1rm && displayWeight && set.reps ? Math.round(displayWeight * (1 + parseInt(set.reps) / 30)) : 0;
  const isAssisted = weightType === 'assisted';
  const asi = isAssisted && displayWeight && displayWeight > 0 ? (displayWeight / BODY_WEIGHT_DEFAULT).toFixed(2) : null;
  const delta = set.prevWeight ? (displayWeight - set.prevWeight) : 0;
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '0';
  const deltaColor = delta > 0 ? 'text-green-500' : delta < 0 ? 'text-red-500' : 'text-zinc-500';
  const isCompleted = set.completed;
  const isEditing = set.isEditing;
  const inputDisabledClass = isCompleted && !isEditing ? 'opacity-50 pointer-events-none' : '';
  const showTotalBadge = effectiveWeight !== null && effectiveWeight !== parseFloat(set.weight || '0');
  const currentSetType = set.setType || 'working';
  const rirVal = set.rir !== undefined && set.rir !== '' ? Number(set.rir) : undefined;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-start mb-3">
      <button onClick={() => onComplete(set.id)} className={`min-w-[48px] min-h-[48px] rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isCompleted ? 'bg-yellow-500 border-yellow-500' : 'bg-transparent border-zinc-700 hover:border-zinc-500'}`}>
        {isCompleted && <Check className="w-6 h-6 text-black stroke-[3]" />}
      </button>
      
      <div className={`flex flex-col gap-1 ${inputDisabledClass}`}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const cur = parseFloat(set.weight || '0') || 0;
              const next = Math.max(0, cur - 2.5);
              onUpdate(set.id, 'weight', next === 0 ? '' : String(next));
            }}
            className="min-w-[48px] min-h-[48px] rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center font-bold text-xl hover:bg-zinc-700 active:scale-95 transition-colors"
            aria-label="Уменьшить вес"
          >
            −
          </button>
          <input 
            type="number" 
            inputMode="decimal" 
            pattern="[0-9.]*"
            min="0"
            step="0.5"
            placeholder={formula.placeholder} 
            value={set.weight} 
            onChange={e => {
              const v = e.target.value;
              if (v === '') { onUpdate(set.id, 'weight', v); return; }
              const num = parseFloat(v);
              if (!isNaN(num) && num >= 0) onUpdate(set.id, 'weight', v);
            }}
            onBlur={() => { if (set.weight && repsRef.current) repsRef.current.focus(); }}
            onFocus={e => e.target.select()}
            className="flex-1 min-h-[48px] bg-zinc-800 rounded-xl text-center text-xl font-bold text-zinc-100 focus:ring-1 focus:ring-blue-500 outline-none tabular-nums" 
          />
          <button
            type="button"
            onClick={() => {
              const cur = parseFloat(set.weight || '0') || 0;
              const next = cur + 2.5;
              onUpdate(set.id, 'weight', String(next));
            }}
            className="min-w-[48px] min-h-[48px] rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center font-bold text-xl hover:bg-zinc-700 active:scale-95 transition-colors"
            aria-label="Увеличить вес"
          >
            +
          </button>
        </div>
        <div className="flex justify-between items-center px-1 text-[10px] flex-wrap gap-x-2 gap-y-0.5">
          {showTotalBadge && effectiveWeight !== null && effectiveWeight >= 0 && (
            <span className="text-blue-400 font-medium">Итого: {effectiveWeight} кг</span>
          )}
          {show1rm && oneRM > 0 && (
            <span className="text-zinc-500">1PM: {oneRM}{rirVal !== undefined && rirVal >= 0 ? ` RIR${rirVal}` : ''}</span>
          )}
          {!show1rm && (weightType === 'assisted' || weightType === 'bodyweight') && (
            <span className="text-zinc-600 text-[9px]">1RM не рассчитывается</span>
          )}
          {asi !== null && <span className="text-zinc-500">ASI: {asi}</span>}
          {set.prevWeight !== undefined && displayWeight > 0 && <span className={`${deltaColor} font-medium`}>{deltaText}</span>}
          <button
            type="button"
            onClick={() => {
              const idx = SET_TYPE_ORDER.indexOf(currentSetType);
              const next = SET_TYPE_ORDER[(idx + 1) % 4];
              onUpdate(set.id, 'setType', next);
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${currentSetType === 'warmup' ? 'bg-zinc-600 text-zinc-300' : currentSetType === 'working' ? 'bg-blue-600/50 text-blue-300' : currentSetType === 'drop' ? 'bg-orange-600/50 text-orange-300' : 'bg-red-600/50 text-red-300'}`}
          >
            {SET_TYPE_LABEL[currentSetType]}
          </button>
          <div className="flex gap-0.5">
            {[0, 1, 2, 3].map(r => (
              <button key={r} type="button" onClick={() => onUpdate(set.id, 'rir', r)} className={`px-1.5 py-0.5 rounded text-[9px] ${rirVal === r ? 'bg-zinc-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}>{r === 3 ? '3+' : r}</button>
            ))}
          </div>
        </div>
      </div>
      <input 
        ref={repsRef}
        type="tel" 
        inputMode="numeric" 
        pattern="[0-9]*"
        placeholder="0" 
        value={set.reps} 
        onChange={e => onUpdate(set.id, 'reps', e.target.value)}
        onFocus={e => e.target.select()}
        className={`w-full min-h-[48px] bg-zinc-800 rounded-xl text-center text-xl font-bold text-zinc-100 focus:ring-1 focus:ring-blue-500 outline-none tabular-nums ${inputDisabledClass}`} 
      />
      <input 
        type="number" 
        inputMode="decimal" 
        pattern="[0-9.]*"
        placeholder="0" 
        value={set.rest} 
        onChange={e => onUpdate(set.id, 'rest', e.target.value)}
        onFocus={e => e.target.select()}
        className={`w-full min-h-[48px] bg-zinc-800 rounded-xl text-center text-zinc-400 focus:text-zinc-100 focus:ring-1 focus:ring-blue-500 outline-none tabular-nums ${inputDisabledClass}`} 
      />
      {isCompleted ? (
        <button onClick={() => onToggleEdit(set.id)} className={`min-w-[48px] min-h-[48px] flex items-center justify-center transition-colors ${isEditing ? 'text-yellow-500' : 'text-zinc-600 hover:text-zinc-400'}`}>
          <Pencil className="w-5 h-5" />
        </button>
      ) : (
        <button onClick={() => onDelete(set.id)} className="min-w-[48px] min-h-[48px] flex items-center justify-center text-zinc-600 hover:text-red-500"><Trash2 className="w-5 h-5" /></button>
      )}
    </motion.div>
  );
};

const WorkoutCard = ({ exerciseData, onAddSet, onUpdateSet, onDeleteSet, onCompleteSet, onToggleEdit, onNoteChange, onAddSuperset, onEditMetadata }: any) => {
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // PR из истории
  const historyPR = useMemo(() => {
    if (!exerciseData.history.length) return 0;
    let maxWeight = 0;
    for (const group of exerciseData.history) {
      // Формат с sets (упрощённый)
      if (group.sets) {
        for (const s of group.sets) {
          if (s.weight > maxWeight) maxWeight = s.weight;
        }
      }
      // Формат с exercises (суперсет - для обратной совместимости)
      if (group.exercises) {
        for (const ex of group.exercises) {
          for (const s of ex.sets || []) {
            if (s.weight > maxWeight) maxWeight = s.weight;
          }
        }
      }
      // Старый плоский формат (для совместимости)
      if (typeof group.weight === 'number' && group.weight > maxWeight) {
        maxWeight = group.weight;
      }
    }
    return maxWeight;
  }, [exerciseData.history]);
  
  // Максимальный вес в текущей сессии (effective для PR)
  const sessionMax = useMemo(() => {
    const completedSets = exerciseData.sets.filter((s: any) => s.completed && (s.weight || s.effectiveWeight));
    if (!completedSets.length) return 0;
    return Math.max(...completedSets.map((s: any) => s.effectiveWeight ?? (parseFloat(s.weight) || 0)));
  }, [exerciseData.sets]);
  
  // Проверяем побит ли PR в текущей сессии
  const isNewPR = sessionMax > historyPR && sessionMax > 0;
  const displayPR = Math.max(historyPR, sessionMax);

  return (
    <Card className="p-4 mb-4">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 flex items-center gap-2">
            <button onClick={onEditMetadata} className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-colors flex-shrink-0" title="Редактировать расчёт веса"><Pencil className="w-4 h-4" /></button>
            <h2 className="text-xl font-semibold text-zinc-50">{exerciseData.exercise.name}</h2>
        </div>
        {/* PR Badge - крупный и заметный */}
        {displayPR > 0 && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${isNewPR ? 'bg-gradient-to-r from-yellow-500 to-orange-500 animate-pulse' : 'bg-zinc-800'}`}>
            <Trophy className={`w-4 h-4 ${isNewPR ? 'text-white' : 'text-yellow-500'}`} />
            <div className="flex flex-col items-end">
              <span className={`text-sm font-bold ${isNewPR ? 'text-white' : 'text-yellow-500'}`}>{displayPR} кг</span>
              {isNewPR && <span className="text-[10px] text-white/90 font-medium">NEW PR!</span>}
            </div>
          </div>
        )}
        <button onClick={() => setShowHistoryModal(true)} className="p-2 bg-zinc-800/50 rounded-lg text-zinc-400 hover:text-blue-500 ml-2"><Calendar className="w-5 h-5" /></button>
      </div>
      <NoteWidget initialValue={exerciseData.note} onChange={onNoteChange} />
      <HistoryListModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} exerciseId={exerciseData.exercise.id} exerciseName={exerciseData.exercise.name} />
      <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 mb-2 px-1">
        <div className="w-10" />
        <div className="text-[10px] text-center text-zinc-500 font-bold uppercase">{WEIGHT_FORMULAS[getWeightInputType(exerciseData.exercise.equipmentType, exerciseData.exercise.weightType)].label}</div>
        <div className="text-[10px] text-center text-zinc-500 font-bold uppercase">ПОВТ</div>
        <div className="text-[10px] text-center text-zinc-500 font-bold uppercase">МИН</div>
        <div className="w-8" />
      </div>
      <div className="space-y-1">
        {exerciseData.sets.map((set: any) => (
          <SetRow key={set.id} set={set} equipmentType={exerciseData.exercise.equipmentType} weightType={exerciseData.exercise.weightType} baseWeight={exerciseData.exercise.baseWeight} weightMultiplier={exerciseData.exercise.weightMultiplier} bodyWeightFactor={exerciseData.exercise.bodyWeightFactor} onUpdate={onUpdateSet} onDelete={onDeleteSet} onComplete={onCompleteSet} onToggleEdit={onToggleEdit} />
        ))}
      </div>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" onClick={onAddSet} className="flex-1 bg-zinc-800/50 border border-dashed border-zinc-700 text-zinc-400 hover:text-blue-500"><Plus className="w-5 h-5 mr-2" /> Подход</Button>
        <Button variant="ghost" onClick={onAddSuperset} className="w-1/3 border border-dashed border-zinc-800 text-zinc-500 hover:text-white"><Plus className="w-4 h-4 mr-1" /> Сет</Button>
      </div>
    </Card>
  );
};

// --- SCREENS (WorkoutScreen stays here - complex with WorkoutCard, SetRow, etc.) ---

const WorkoutScreen = ({ initialExercise, allExercises, onBack, incrementOrder, haptic, notify, setExerciseToEdit, registerSessionDataUpdater }: any) => {
  // ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ: Проверяем наличие незавершенной тренировки
  const getSavedSession = () => {
    try {
        const raw = localStorage.getItem(WORKOUT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  
  const savedSession = useMemo(() => getSavedSession(), []);

  // sessionId: при восстановлении — из сохранения; при новой сессии — из api.startSession
  const [sessionId, setSessionId] = useState<string | null>(savedSession ? savedSession.localGroupId : null);
  useEffect(() => {
    if (savedSession) return;
    api.startSession().then((r) => {
      setSessionId(r?.session_id || crypto.randomUUID());
    });
  }, [savedSession]);
  const localGroupId = sessionId ?? '';
  
  const timer = useTimer();
  
  // Инициализируем из сохранения или с начальным упражнением
  const [activeExercises, setActiveExercises] = useState<string[]>(
      savedSession ? savedSession.activeExercises : [initialExercise.id]
  );
  
  // Инициализируем данные упражнений
  const [sessionData, setSessionData] = useState<Record<string, ExerciseSessionData>>(
      savedSession ? savedSession.sessionData : {}
  );

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [finishSrpe, setFinishSrpe] = useState('');
  const [finishBodyWeight, setFinishBodyWeight] = useState('');
  const [supersetSearchQuery, setSupersetSearchQuery] = useState('');

  useEffect(() => {
    if (!registerSessionDataUpdater) return;
    registerSessionDataUpdater((id: string, updates: Partial<Exercise>) => {
      setSessionData(prev => prev[id] ? { ...prev, [id]: { ...prev[id], exercise: { ...prev[id].exercise, ...updates } } } : prev);
    });
    return () => registerSessionDataUpdater(null);
  }, [registerSessionDataUpdater]);

  // АВТОСОХРАНЕНИЕ: Сохраняем при любом изменении данных
  useEffect(() => {
      // Сохраняем только если есть данные
      if (Object.keys(sessionData).length > 0) {
          const workoutState = {
              localGroupId,
              activeExercises,
              sessionData,
              timestamp: Date.now()
          };
          localStorage.setItem(WORKOUT_STORAGE_KEY, JSON.stringify(workoutState));
      }
  }, [localGroupId, activeExercises, sessionData]);

  const loadExerciseData = async (exId: string) => {
    // Загружаем историю (асинхронно)
    const { history, note } = await api.getHistory(exId);
    
    setSessionData(prev => {
        // Если пользователь уже ввел данные (пока грузилась история), не перезаписываем подходы!
        // Но обновляем историю и заметку
        const currentData = prev[exId];
        const exercise = allExercises.find((e: Exercise) => e.id === exId);
        
        if (!exercise) return prev; // Если упражнение не найдено, выходим

        // Если данные уже были (восстановлены или введены), обновляем только историю/заметку
        if (currentData && currentData.sets && currentData.sets.length > 0) {
             return {
                 ...prev,
                 [exId]: {
                     ...currentData,
                     exercise, // Обновляем объект упражнения на всякий случай
                     history: history, // Подгрузилась история
                     note: currentData.note || note || '' // Заметка: приоритет текущей
                 }
             };
        }
        
        let initialSets: WorkoutSet[] = [];
        if (history.length > 0) {
            // Новая структура: history - массив групп с isSuperset
            // Берем первую группу (самую новую дату)
            const firstGroup = history[0];
            const lastDate = firstGroup?.date;
            
            if (lastDate) {
                // Если это суперсет, находим подходы текущего упражнения
                if (firstGroup.isSuperset && firstGroup.exercises) {
                    const currentExercise = firstGroup.exercises.find((ex: any) => ex.exerciseId === exId);
                    if (currentExercise && currentExercise.sets) {
                        initialSets = currentExercise.sets.map((s: any) => createSetFromHistory(s, s.weight));
                    }
                } else if (firstGroup.sets) {
                    initialSets = firstGroup.sets.map((s: any) => createSetFromHistory(s, s.weight));
                }
                
                if (initialSets.length === 0) {
                    initialSets = [createEmptySet()];
                }
            } else {
                initialSets = [createEmptySet()];
            }
        } else {
            initialSets = [createEmptySet()];
        }
        return { ...prev, [exId]: { exercise: allExercises.find((e: Exercise) => e.id === exId)!, note: note || '', history, sets: initialSets } };
    });
  };

  useEffect(() => { activeExercises.forEach(id => loadExerciseData(id)); }, [activeExercises]);

  const updateSetDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdateRef = useRef<{
    exId: string;
    setId: string;
    setGroupId: string;
    order: number;
    weight: string;
    reps: string;
    rest: string;
    rowNumber?: number | string;
    equipmentType?: string;
    weightType?: string;
    baseWeight?: number;
    weightMultiplier?: number;
    bodyWeightFactor?: number;
  } | null>(null);
  
  useEffect(() => () => { if (updateSetDebounceRef.current) clearTimeout(updateSetDebounceRef.current); }, []);

  const handleCompleteSet = async (exId: string, setId: string) => {
    const set = sessionData[exId].sets.find(s => s.id === setId);
    if (!set || set.completed) return;
    if (!set.weight || !set.reps) { notify('error'); return; }
    
    const exercise = sessionData[exId].exercise;
    const weightType = getWeightInputType(exercise?.equipmentType, exercise?.weightType);
    const inputWeight = parseFloat(set.weight);
    const effectiveWeight = calcEffectiveWeight(set.weight, weightType, undefined, exercise?.baseWeight, exercise?.weightMultiplier, exercise?.bodyWeightFactor) ?? inputWeight;
    
    haptic('medium');
    const order = incrementOrder();
    setSessionData(prev => ({ ...prev, [exId]: { ...prev[exId], sets: prev[exId].sets.map(s => s.id === setId ? { ...s, completed: true, order, setGroupId: localGroupId, effectiveWeight } : s) } }));
    timer.resetAndStart();

    const result = await api.saveSet({
        id: setId,
        exercise_id: exId,
        exercise_name: exercise?.name,
        weight: effectiveWeight,
        input_weight: inputWeight,
        reps: parseInt(set.reps),
        rest: parseFloat(set.rest) || 0,
        note: sessionData[exId].note,
        set_group_id: localGroupId,
        session_id: localGroupId,
        set_type: set.setType || 'working',
        rpe: set.rpe != null ? Number(set.rpe) : undefined,
        rir: set.rir != null ? Number(set.rir) : undefined,
        is_low_confidence: set.isLowConfidence ?? false,
        order
    });
    const rowNum = result?.row_number ?? setId;
    if (result?.row_number) {
        setSessionData(prev => ({
            ...prev,
            [exId]: {
                ...prev[exId],
                sets: prev[exId].sets.map(s => s.id === setId ? { ...s, rowNumber: rowNum } : s)
            }
        }));
    } else if (result?.pending_id) {
        setSessionData(prev => ({
            ...prev,
            [exId]: {
                ...prev[exId],
                sets: prev[exId].sets.map(s => s.id === setId ? { ...s, pendingId: result.pending_id, rowNumber: rowNum } : s)
            }
        }));
    }
    
    // Показываем успех в любом случае (данные либо на сервере, либо в очереди)
    notify('success');
  };

  const handleUpdateSet = (exId: string, setId: string, field: string, val: string | number) => {
    setSessionData(prev => {
      const next = { ...prev, [exId]: { ...prev[exId], sets: prev[exId].sets.map(s => s.id === setId ? { ...s, [field]: val } : s) } };
      const set = next[exId].sets.find(s => s.id === setId);
      
      // Если подход выполнен, в режиме редактирования и имеет rowNumber (или fallback на order/setGroupId)
      if (set?.completed && set.isEditing && (set.rowNumber || (set.order != null && set.setGroupId))) {
        const exercise = prev[exId]?.exercise;
        pendingUpdateRef.current = {
          exId,
          setId,
          setGroupId: set.setGroupId || '',
          order: set.order || 0,
          weight: set.weight,
          reps: set.reps,
          rest: set.rest,
          rowNumber: set.rowNumber,
          equipmentType: exercise?.equipmentType,
          weightType: exercise?.weightType,
          baseWeight: exercise?.baseWeight,
          weightMultiplier: exercise?.weightMultiplier,
          bodyWeightFactor: exercise?.bodyWeightFactor
        };
        
        // Очищаем предыдущий таймер и запускаем новый
        if (updateSetDebounceRef.current) clearTimeout(updateSetDebounceRef.current);
        updateSetDebounceRef.current = setTimeout(async () => {
          updateSetDebounceRef.current = null;
          const data = pendingUpdateRef.current;
          if (!data) return;
          
          try {
            const effective = calcEffectiveWeight(data.weight, getWeightInputType(data.equipmentType, data.weightType), undefined, data.baseWeight, data.weightMultiplier, data.bodyWeightFactor) ?? (parseFloat(data.weight) || 0);
            const result = await api.updateSet({
              row_number: data.rowNumber,
              exercise_id: data.exId,
              set_group_id: data.setGroupId,
              order: data.order,
              weight: effective,
              input_weight: parseFloat(data.weight) || 0,
              reps: parseInt(data.reps) || 0,
              rest: parseFloat(data.rest) || 0
            });
            
            if (result?.status === 'success') {
              // После успешного сохранения - карандаш становится серым
              setSessionData(s => ({
                ...s,
                [data.exId]: {
                  ...s[data.exId],
                  sets: s[data.exId].sets.map(st => st.id === data.setId ? { ...st, isEditing: false } : st)
                }
              }));
            }
          } catch {
            // Silent fail for update set
          }
        }, 1500); // 1.5 секунды - теперь не нужно ждать долго
      }
      
      return next;
    });
  };
  
  const handleToggleEdit = (exId: string, setId: string) => {
    setSessionData(prev => ({
      ...prev,
      [exId]: {
        ...prev[exId],
        sets: prev[exId].sets.map(s => s.id === setId ? { ...s, isEditing: !s.isEditing } : s)
      }
    }));
  };

  const handleAddSet = (exId: string) => {
    setSessionData(prev => {
        const currentSets = prev[exId].sets;
        const lastSet = currentSets[currentSets.length - 1];
        const newSet = createEmptySet({ weight: lastSet?.weight || '', reps: lastSet?.reps || '', rest: lastSet?.rest || '' });
        return { ...prev, [exId]: { ...prev[exId], sets: [...currentSets, newSet] } };
    });
  };

  const handleDeleteSet = (exId: string, setId: string) => {
      setSessionData(prev => {
          if (!prev[exId]) return prev;
          const filteredSets = prev[exId].sets.filter(s => s.id !== setId);
          const finalSets = filteredSets.length === 0 ? [createEmptySet()] : filteredSets;
          return { ...prev, [exId]: { ...prev[exId], sets: finalSets } };
      });
  };

  const handleFinishClick = () => setIsFinishModalOpen(true);

  const handleConfirmFinish = async () => {
    const srpe = Math.min(10, Math.max(0, parseFloat(finishSrpe) || 0));
    const bodyWeight = parseFloat(finishBodyWeight) || 0;
    await api.finishSession({ session_id: localGroupId, srpe, body_weight: bodyWeight });
    localStorage.removeItem(WORKOUT_STORAGE_KEY);
    setIsFinishModalOpen(false);
    onBack();
  };

  const sessionTonnage = useMemo(() => {
    let total = 0;
    for (const exId of activeExercises) {
      const data = sessionData[exId];
      if (!data) continue;
      const ex = data.exercise;
      const weightType = getWeightInputType(ex?.equipmentType, ex?.weightType);
      for (const s of data.sets || []) {
        if (!s.completed || !s.weight || !s.reps) continue;
        const w = calcEffectiveWeight(s.weight, weightType, undefined, ex?.baseWeight, ex?.weightMultiplier, ex?.bodyWeightFactor) ?? (parseFloat(s.weight) || 0);
        total += w * (parseInt(s.reps) || 0);
      }
    }
    return total;
  }, [sessionData, activeExercises]);

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-28">
      <TimerBlock timer={timer} onToggle={() => timer.isRunning ? timer.reset() : timer.start()} sessionTonnage={sessionTonnage} />
      <div className="px-4 space-y-4 pb-4">
        {activeExercises.map(exId => {
            const data = sessionData[exId];
            if (!data) return <div key={exId} className="h-40 bg-zinc-900 rounded-2xl animate-pulse" />;
            return <WorkoutCard key={exId} exerciseData={data} onAddSet={() => handleAddSet(exId)} onUpdateSet={(sid: string, f: string, v: string | number) => handleUpdateSet(exId, sid, f, v)} onDeleteSet={(sid: string) => handleDeleteSet(exId, sid)} onCompleteSet={(sid: string) => handleCompleteSet(exId, sid)} onToggleEdit={(sid: string) => handleToggleEdit(exId, sid)} onNoteChange={(val: string) => setSessionData(p => ({...p, [exId]: {...p[exId], note: val}}))} onAddSuperset={() => setIsAddModalOpen(true)} onEditMetadata={() => setExerciseToEdit(data.exercise)} />;
        })}
      </div>
      <StickyBottomBar>
        <Button variant="primary" onClick={handleFinishClick} className="w-full min-h-[48px] text-lg font-semibold shadow-xl shadow-blue-900/20">Завершить тренировку</Button>
      </StickyBottomBar>
      <Modal isOpen={isFinishModalOpen} onClose={() => setIsFinishModalOpen(false)} title="Завершить тренировку">
        <div className="space-y-4">
          <Input label="Оцените тяжесть тренировки (sRPE) от 1 до 10" type="number" min={1} max={10} step={1} placeholder="1–10" value={finishSrpe} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFinishSrpe(e.target.value)} />
          <Input label="Ваш текущий вес тела (кг)" type="number" inputMode="decimal" min={0} step={0.1} placeholder="кг" value={finishBodyWeight} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFinishBodyWeight(e.target.value)} rightAddon="кг" />
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={handleConfirmFinish} className="flex-1">Пропустить</Button>
            <Button variant="primary" onClick={handleConfirmFinish} className="flex-1">Завершить</Button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setSupersetSearchQuery(''); }} title="Добавить в суперсет">
        <div className="space-y-3">
          <Input 
            placeholder="Поиск упражнения..." 
            value={supersetSearchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSupersetSearchQuery(e.target.value)}
            onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
            leftIcon={<Search className="w-4 h-4" />}
            className="bg-zinc-900 w-full" 
          />
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {allExercises
              .filter((ex: Exercise) => 
                ex.name.toLowerCase().includes(supersetSearchQuery.toLowerCase())
              )
              .map((ex: Exercise) => (
                <div 
                  key={ex.id} 
                  onClick={() => { 
                    if (!activeExercises.includes(ex.id)) {
                      setActiveExercises([...activeExercises, ex.id]);
                    }
                    setIsAddModalOpen(false);
                    setSupersetSearchQuery('');
                  }} 
                  className="flex items-center p-3 bg-zinc-800/50 rounded-xl border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors"
                >
                  <div className="font-medium text-zinc-200">{ex.name}</div>
                  {activeExercises.includes(ex.id) && <Check className="ml-auto text-green-500 w-5 h-5"/>}
                </div>
              ))}
            {allExercises.filter((ex: Exercise) => 
              ex.name.toLowerCase().includes(supersetSearchQuery.toLowerCase())
            ).length === 0 && (
              <div className="text-center text-zinc-500 py-4 text-sm">Упражнения не найдены</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

const EditExerciseModal = ({ isOpen, onClose, exercise, groups, onSave }: { isOpen: boolean; onClose: () => void; exercise: Exercise | null; groups: string[]; onSave: (id: string, updates: Partial<Exercise>) => void | Promise<void> }) => {
    
    const [name, setName] = useState('');
    const [group, setGroup] = useState('');
    const [secondaryMuscles, setSecondaryMuscles] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState('');
    const [image2, setImage2] = useState('');
    const [weightType, setWeightType] = useState<string>('Dumbbell');
    const [baseWeight, setBaseWeight] = useState(0);
    const [weightMultiplier, setWeightMultiplier] = useState(1);
    const [bodyWeightFactor, setBodyWeightFactor] = useState(1);
    const [testInput, setTestInput] = useState('10');
    const [testBodyWt, setTestBodyWt] = useState(90);
    
    // Сохраняем состояние в localStorage при каждом изменении
    useEffect(() => {
        if (exercise && isOpen) {
            const draft = {
                exerciseId: exercise.id,
                name,
                group,
                secondaryMuscles,
                description,
                image,
                image2,
                weightType,
                baseWeight,
                weightMultiplier,
                bodyWeightFactor
            };
            localStorage.setItem(EDIT_EXERCISE_DRAFT_KEY, JSON.stringify(draft));
        }
    }, [name, group, secondaryMuscles, description, image, image2, weightType, baseWeight, weightMultiplier, bodyWeightFactor, exercise, isOpen]);
    
    // Восстанавливаем состояние из localStorage или из exercise
    useEffect(() => { 
        if(exercise && isOpen) {
            // Пытаемся восстановить из localStorage
            const saved = localStorage.getItem(EDIT_EXERCISE_DRAFT_KEY);
            if (saved) {
                try {
                    const draft = JSON.parse(saved);
                    // Проверяем, что это тот же exercise
                    if (draft.exerciseId === exercise.id) {
                        setName(draft.name || exercise.name);
                        setGroup(draft.group || exercise.muscleGroup);
                        setSecondaryMuscles(draft.secondaryMuscles ?? exercise.secondaryMuscles ?? '');
                        setDescription(draft.description || exercise.description || '');
                        setImage(draft.image || exercise.imageUrl || '');
                        setImage2(draft.image2 || exercise.imageUrl2 || '');
                        setWeightType(draft.weightType ?? exercise.weightType ?? 'Dumbbell');
                        setBaseWeight(draft.baseWeight ?? exercise.baseWeight ?? 0);
                        setWeightMultiplier(draft.weightMultiplier ?? exercise.weightMultiplier ?? 1);
                        setBodyWeightFactor(draft.bodyWeightFactor ?? exercise.bodyWeightFactor ?? 1);
                        return;
                    }
                } catch {
                    // Ignore draft parse error
                }
            }
            // Если нет сохраненного или это другой exercise, используем данные из exercise
            setName(exercise.name); 
            setGroup(exercise.muscleGroup); 
            setSecondaryMuscles(exercise.secondaryMuscles || '');
            setDescription(exercise.description || '');
            setImage(exercise.imageUrl || ''); 
            setImage2(exercise.imageUrl2 || '');
            setWeightType(exercise.weightType || 'Dumbbell');
            setBaseWeight(exercise.baseWeight ?? 0);
            setWeightMultiplier(exercise.weightMultiplier ?? 1);
            setBodyWeightFactor(exercise.bodyWeightFactor ?? 1);
        }
    }, [exercise, isOpen]);
    
    // Очищаем сохраненное состояние при закрытии модального окна
    useEffect(() => {
        if (!isOpen) {
            localStorage.removeItem(EDIT_EXERCISE_DRAFT_KEY);
        }
    }, [isOpen]);
    
    // Сохраняем состояние при сворачивании приложения (visibilitychange)
    useEffect(() => {
        if (!isOpen || !exercise) return;
        
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Приложение свернуто - сохраняем состояние
                const draft = { exerciseId: exercise.id, name, group, secondaryMuscles, description, image, image2, weightType, baseWeight, weightMultiplier, bodyWeightFactor };
                localStorage.setItem(EDIT_EXERCISE_DRAFT_KEY, JSON.stringify(draft));
            } else {
                // Приложение снова видимо - восстанавливаем состояние
                const saved = localStorage.getItem(EDIT_EXERCISE_DRAFT_KEY);
                if (saved) {
                    try {
                        const draft = JSON.parse(saved);
                        if (draft.exerciseId === exercise.id) {
                            setName(draft.name || exercise.name);
                            setGroup(draft.group || exercise.muscleGroup);
                            setSecondaryMuscles(draft.secondaryMuscles ?? exercise.secondaryMuscles ?? '');
                            setDescription(draft.description || exercise.description || '');
                            setImage(draft.image || exercise.imageUrl || '');
                            setImage2(draft.image2 || exercise.imageUrl2 || '');
                            setWeightType(draft.weightType ?? exercise.weightType ?? 'Dumbbell');
                            setBaseWeight(draft.baseWeight ?? exercise.baseWeight ?? 0);
                            setWeightMultiplier(draft.weightMultiplier ?? exercise.weightMultiplier ?? 1);
                            setBodyWeightFactor(draft.bodyWeightFactor ?? exercise.bodyWeightFactor ?? 1);
                        }
                    } catch {
                        // Ignore
                    }
                }
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isOpen, exercise, name, group, secondaryMuscles, description, image, image2, weightType, baseWeight, weightMultiplier, bodyWeightFactor]);
    
    const [uploadingImage1, setUploadingImage1] = useState(false);
    const [uploadingImage2, setUploadingImage2] = useState(false);

    const saveDraft = () => {
        if (exercise) {
            const draft = { exerciseId: exercise.id, name, group, secondaryMuscles, description, image, image2, weightType, baseWeight, weightMultiplier, bodyWeightFactor };
            localStorage.setItem(EDIT_EXERCISE_DRAFT_KEY, JSON.stringify(draft));
        }
    };

    const handleUpload = async (file: File, slot: 1 | 2): Promise<string | null> => {
        slot === 1 ? setUploadingImage1(true) : setUploadingImage2(true);
        try {
            const result = await api.uploadImage(file);
            return result?.url ?? null;
        } finally {
            slot === 1 ? setUploadingImage1(false) : setUploadingImage2(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Редактировать">
            <div className="space-y-6">
                <ImageUploadSlot
                    value={image}
                    onChange={setImage}
                    onUpload={(f: File) => handleUpload(f, 1)}
                    uploading={uploadingImage1}
                    label="Основное фото"
                    inputId="edit-exercise-image-1"
                    onBeforeOpen={saveDraft}
                />
                <ImageUploadSlot
                    value={image2}
                    onChange={setImage2}
                    onUpload={(f: File) => handleUpload(f, 2)}
                    uploading={uploadingImage2}
                    label="Дополнительное фото"
                    inputId="edit-exercise-image-2"
                    onBeforeOpen={saveDraft}
                />
                <div><label className="text-sm text-zinc-400 mb-1 block">Название</label><Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} /></div>
                
                <div>
                    <label className="text-sm text-zinc-400 mb-1 block">Описание</label>
                    <textarea 
                        value={description} 
                        onChange={(e) => setDescription(e.target.value)} 
                        className="w-full bg-zinc-900 text-zinc-50 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-zinc-600 placeholder:text-zinc-600 transition-all min-h-[100px] resize-none" 
                        placeholder="Добавьте описание..." 
                    />
                </div>

                <div>
                    <label className="text-sm text-zinc-400 mb-1 block">Группа</label>
                    <div className="flex flex-wrap gap-2">{groups.map((g: string) => <button key={g} onClick={() => setGroup(g)} className={`px-3 py-2 rounded-xl text-sm border ${group === g ? 'bg-blue-600 border-blue-600 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>{g}</button>)}</div>
                </div>

                <div><label className="text-sm text-zinc-400 mb-1 block">Вспомогательные мышцы</label><Input value={secondaryMuscles} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecondaryMuscles(e.target.value)} placeholder="Например: Трицепс, Плечи" /></div>

                <div className="pt-4 border-t border-zinc-800">
                    <label className="text-sm text-zinc-400 mb-2 block">Расчёт нагрузки</label>
                    <div className="space-y-3">
                        <div>
                            <span className="text-xs text-zinc-500 block mb-1">Тип</span>
                            <select value={weightType} onChange={e => setWeightType(e.target.value)} className="w-full h-10 bg-zinc-800 rounded-xl px-3 text-zinc-100 text-sm focus:ring-1 focus:ring-blue-500 outline-none">
                                {WEIGHT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500 w-24">База, кг</span>
                            <button type="button" onClick={() => setBaseWeight(Math.max(0, baseWeight - 2.5))} className="w-10 h-10 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700">−</button>
                            <span className="flex-1 text-center font-bold text-zinc-100 tabular-nums">{baseWeight}</span>
                            <button type="button" onClick={() => setBaseWeight(baseWeight + 2.5)} className="w-10 h-10 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700">+</button>
                        </div>
                        <div className="flex gap-2">
                            <span className="text-xs text-zinc-500 self-center">Multiplier</span>
                            <button type="button" onClick={() => setWeightMultiplier(1)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${weightMultiplier === 1 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>1</button>
                            <button type="button" onClick={() => setWeightMultiplier(2)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${weightMultiplier === 2 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>2</button>
                        </div>
                        {weightType === 'Bodyweight' && (
                            <div>
                                <span className="text-xs text-zinc-500 block mb-1">Биомеханический коэффициент (0.68 — отжимания)</span>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setBodyWeightFactor(1)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${bodyWeightFactor === 1 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>1.0</button>
                                    <button type="button" onClick={() => setBodyWeightFactor(0.68)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${bodyWeightFactor === 0.68 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>0.68</button>
                                </div>
                            </div>
                        )}
                        <div className="pt-2 border-t border-zinc-800/50">
                            <span className="text-xs text-zinc-500 block mb-1">Проверка</span>
                            <div className="flex gap-2 items-center flex-wrap">
                                <input type="number" value={testInput} onChange={e => setTestInput(e.target.value)} placeholder="Input" className="w-16 h-8 bg-zinc-800 rounded px-2 text-zinc-100 text-sm" />
                                {(weightType === 'Assisted' || weightType === 'Bodyweight') && (
                                    <input type="number" value={testBodyWt} onChange={e => setTestBodyWt(Number(e.target.value) || 90)} className="w-16 h-8 bg-zinc-800 rounded px-2 text-zinc-100 text-sm" />
                                )}
                                {(() => {
                                    const wt = getWeightInputType(undefined, weightType);
                                    const f = WEIGHT_FORMULAS[wt];
                                    const bwFactor = wt === 'bodyweight' ? bodyWeightFactor : undefined;
                                    const eff = !isNaN(parseFloat(testInput) || 0) ? f.toEffective(parseFloat(testInput) || 0, testBodyWt, baseWeight, weightMultiplier, bwFactor) : null;
                                    return eff !== null ? <span className="text-blue-400 text-sm">→ {eff} кг</span> : null;
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                <Button 
                    onClick={async () => { 
                        if (!exercise) return;
                        localStorage.removeItem(EDIT_EXERCISE_DRAFT_KEY);
                        await onSave(exercise.id, { name, muscleGroup: group, secondaryMuscles, description, imageUrl: image, imageUrl2: image2, weightType, baseWeight, weightMultiplier, bodyWeightFactor }); 
                        onClose(); 
                    }} 
                    className="w-full h-12"
                    disabled={uploadingImage1 || uploadingImage2}
                >
                    {uploadingImage1 || uploadingImage2 ? 'Загрузка...' : 'Сохранить'}
                </Button>
            </div>
        </Modal>
    );
};

// --- MAIN ---

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
            onChange={(e: any) => setAuthInput(e.target.value)}
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
    <div className="bg-zinc-950 min-h-screen text-zinc-50 font-sans selection:bg-blue-500/30 pt-24">
      {/* Индикатор офлайн-статуса */}
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