import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Check, ChevronDown } from 'lucide-react';
import { getWeightInputType, calcEffectiveWeight, WEIGHT_FORMULAS } from '../exerciseConfig';
import { WORKOUT_STORAGE_KEY } from '../constants';
import { createEmptySet, createSetFromHistory } from '../utils';
import { useTimer } from '../hooks/useTimer';
import { TimerBlock } from '../components/TimerBlock';
import { NoteWidget } from '../components/NoteWidget';
import { HistoryListModal } from '../components/HistoryListModal';
import { SetRow } from '../components/SetRow';
import { Card, Button, Input, Modal, StickyBottomBar } from '../ui';
import { api } from '../api';
import type { Exercise, WorkoutSet, ExerciseSessionData } from '../types';
import { Calendar, Pencil, Trophy } from 'lucide-react';

interface WorkoutCardProps {
  exerciseData: ExerciseSessionData;
  onAddSet: () => void;
  onUpdateSet: (sid: string, field: string, value: string | number) => void;
  onDeleteSet: (sid: string) => void;
  onCompleteSet: (sid: string) => void;
  onToggleEdit: (sid: string) => void;
  onNoteChange: (val: string) => void;
  onAddSuperset: () => void;
  onEditMetadata: () => void;
}

const WorkoutCard = ({ exerciseData, onAddSet, onUpdateSet, onDeleteSet, onCompleteSet, onToggleEdit, onNoteChange, onAddSuperset, onEditMetadata }: WorkoutCardProps) => {
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const historyPR = useMemo(() => {
    if (!exerciseData.history.length) return 0;
    let maxWeight = 0;
    for (const group of exerciseData.history) {
      if (group.sets) {
        for (const s of group.sets) {
          if (s.weight > maxWeight) maxWeight = s.weight;
        }
      }
      if (group.exercises) {
        for (const ex of group.exercises) {
          for (const s of ex.sets || []) {
            if (s.weight > maxWeight) maxWeight = s.weight;
          }
        }
      }
      if (typeof group.weight === 'number' && group.weight > maxWeight) {
        maxWeight = group.weight;
      }
    }
    return maxWeight;
  }, [exerciseData.history]);

  const sessionMax = useMemo(() => {
    const completedSets = exerciseData.sets.filter((s) => s.completed && (s.weight || s.effectiveWeight));
    if (!completedSets.length) return 0;
    return Math.max(...completedSets.map((s) => s.effectiveWeight ?? (parseFloat(s.weight) || 0)));
  }, [exerciseData.sets]);

  const isNewPR = sessionMax > historyPR && sessionMax > 0;
  const displayPR = Math.max(historyPR, sessionMax);

  return (
    <Card className="p-4 mb-4">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 flex items-center gap-2">
            <button onClick={onEditMetadata} className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-colors flex-shrink-0" title="Редактировать расчёт веса"><Pencil className="w-4 h-4" /></button>
            <h2 className="text-xl font-semibold text-zinc-50">{exerciseData.exercise.name}</h2>
        </div>
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
      <div className="grid grid-cols-[48px_1fr_1fr_1fr_48px] gap-1.5 mb-2 px-1 items-center">
        <div />
        <div className="text-[10px] text-center text-zinc-500 font-bold uppercase">{WEIGHT_FORMULAS[getWeightInputType(exerciseData.exercise.equipmentType, exerciseData.exercise.weightType)].label}</div>
        <div className="text-[10px] text-center text-zinc-500 font-bold uppercase">ПОВТ</div>
        <div className="text-[10px] text-center text-zinc-500 font-bold uppercase">МИН</div>
        <div />
      </div>
      <div className="space-y-1">
        {exerciseData.sets.map((set: WorkoutSet) => (
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

export interface WorkoutScreenProps {
  initialExercise: Exercise;
  allExercises: Exercise[];
  onBack: () => void;
  incrementOrder: () => number;
  haptic: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notify: (type: 'error' | 'success' | 'warning') => void;
  setExerciseToEdit: (exercise: Exercise) => void;
  registerSessionDataUpdater: (fn: ((id: string, updates: Partial<Exercise>) => void) | null) => void;
}

export const WorkoutScreen = ({ initialExercise, allExercises, onBack, incrementOrder, haptic, notify, setExerciseToEdit, registerSessionDataUpdater }: WorkoutScreenProps) => {
  const getSavedSession = () => {
    try {
        const raw = localStorage.getItem(WORKOUT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const savedSession = useMemo(() => getSavedSession(), []);

  const [sessionId, setSessionId] = useState<string | null>(savedSession ? savedSession.localGroupId : null);
  useEffect(() => {
    if (savedSession) return;
    api.startSession().then((r: any) => {
      setSessionId(r?.session_id || crypto.randomUUID());
    });
  }, [savedSession]);
  const localGroupId = sessionId ?? '';

  const timer = useTimer();

  const [activeExercises, setActiveExercises] = useState<string[]>(
      savedSession ? savedSession.activeExercises : [initialExercise.id]
  );

  const [sessionData, setSessionData] = useState<Record<string, ExerciseSessionData>>(
      savedSession ? savedSession.sessionData : {}
  );

  const [collapsedExercises, setCollapsedExercises] = useState<Set<string>>(
    new Set(savedSession?.collapsedExercises || [])
  );

  const allSetsCompleted = (exId: string) => {
    const data = sessionData[exId];
    if (!data || data.sets.length === 0) return false;
    return data.sets.every(s => s.completed);
  };

  const toggleCollapse = (exId: string) => {
    setCollapsedExercises(prev => {
      const next = new Set(prev);
      next.has(exId) ? next.delete(exId) : next.add(exId);
      return next;
    });
  };

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalAnchorExId, setAddModalAnchorExId] = useState<string | null>(null);
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

  useEffect(() => {
      if (Object.keys(sessionData).length > 0) {
          const workoutState = {
              localGroupId,
              activeExercises,
              sessionData,
              collapsedExercises: [...collapsedExercises],
              timestamp: Date.now()
          };
          localStorage.setItem(WORKOUT_STORAGE_KEY, JSON.stringify(workoutState));
      }
  }, [localGroupId, activeExercises, sessionData, collapsedExercises]);

  const loadExerciseData = async (exId: string) => {
    const { history, note } = await api.getHistory(exId);

    setSessionData(prev => {
        const currentData = prev[exId];
        const exercise = allExercises.find((e: Exercise) => e.id === exId);

        if (!exercise) return prev;

        if (currentData && currentData.sets && currentData.sets.length > 0) {
             return {
                 ...prev,
                 [exId]: {
                     ...currentData,
                     exercise,
                     history: history,
                     note: currentData.note || note || ''
                 }
             };
        }

        let initialSets: WorkoutSet[] = [];
        if (history.length > 0) {
            const firstGroup = history[0];
            const lastDate = firstGroup?.date;

            if (lastDate) {
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
        return { ...prev, [exId]: { exercise: allExercises.find((e: Exercise) => e.id === exId)!, note: note || '', history, sets: initialSets, setGroupId: exId } };
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
    const exSetGroupId = sessionData[exId].setGroupId || exId;
    setSessionData(prev => ({ ...prev, [exId]: { ...prev[exId], sets: prev[exId].sets.map(s => s.id === setId ? { ...s, completed: true, order, setGroupId: exSetGroupId, effectiveWeight } : s) } }));
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
        set_group_id: exSetGroupId,
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

    notify('success');
  };

  const handleUpdateSet = (exId: string, setId: string, field: string, val: string | number) => {
    setSessionData(prev => {
      const next = { ...prev, [exId]: { ...prev[exId], sets: prev[exId].sets.map(s => s.id === setId ? { ...s, [field]: val } : s) } };
      const set = next[exId].sets.find(s => s.id === setId);

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
        }, 1500);
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
            if (collapsedExercises.has(exId)) {
              const sets = data.sets.filter(s => s.completed);
              const totalSets = sets.length;
              const totalReps = sets.reduce((sum, s) => sum + (parseInt(s.reps) || 0), 0);
              const maxWt = Math.max(0, ...sets.map(s => parseFloat(s.weight) || 0));
              return (
                <button key={exId} onClick={() => toggleCollapse(exId)}
                  className="w-full text-left px-4 py-3 bg-zinc-900/80 border border-zinc-800 rounded-2xl flex items-center justify-between transition-colors hover:bg-zinc-800/60">
                  <div className="min-w-0">
                    <span className="font-semibold text-zinc-200 truncate block">{data.exercise.name}</span>
                    <span className="text-xs text-zinc-500">{totalSets} подх. · {maxWt} кг · {totalReps} повт.</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0 ml-2" />
                </button>
              );
            }
            return <WorkoutCard key={exId} exerciseData={data} onAddSet={() => handleAddSet(exId)} onUpdateSet={(sid: string, f: string, v: string | number) => handleUpdateSet(exId, sid, f, v)} onDeleteSet={(sid: string) => handleDeleteSet(exId, sid)} onCompleteSet={(sid: string) => handleCompleteSet(exId, sid)} onToggleEdit={(sid: string) => handleToggleEdit(exId, sid)} onNoteChange={(val: string) => setSessionData(p => ({...p, [exId]: {...p[exId], note: val}}))} onAddSuperset={() => { setAddModalAnchorExId(exId); setIsAddModalOpen(true); }} onEditMetadata={() => setExerciseToEdit(data.exercise)} />;
        })}
        <Button variant="secondary" onClick={() => { setAddModalAnchorExId(null); setIsAddModalOpen(true); }} className="w-full bg-zinc-900/50 border border-dashed border-zinc-700 text-zinc-400 hover:text-blue-500 mt-4 min-h-[48px]">
          <Plus className="w-5 h-5 mr-2" /> Добавить упражнение
        </Button>
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
      <Modal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setAddModalAnchorExId(null); setSupersetSearchQuery(''); }} title={addModalAnchorExId ? "Добавить в сет" : "Добавить упражнение"}>
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
                      const sharedGroupId = addModalAnchorExId
                        ? (sessionData[addModalAnchorExId]?.setGroupId ?? addModalAnchorExId)
                        : ex.id;
                      // Auto-collapse completed exercises
                      const toCollapse = activeExercises.filter(id => allSetsCompleted(id));
                      if (toCollapse.length > 0) {
                        setCollapsedExercises(prev => {
                          const next = new Set(prev);
                          toCollapse.forEach(id => next.add(id));
                          return next;
                        });
                      }
                      setActiveExercises([...activeExercises, ex.id]);
                      setSessionData(prev => ({
                        ...prev,
                        [ex.id]: {
                          ...(prev[ex.id] || { exercise: ex, note: '', sets: [createEmptySet()], history: [] }),
                          setGroupId: sharedGroupId
                        }
                      }));
                    }
                    setIsAddModalOpen(false);
                    setAddModalAnchorExId(null);
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
