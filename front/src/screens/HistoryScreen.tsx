import { useState } from 'react';
import { Link as LinkIcon, Activity } from 'lucide-react';
import type { GlobalWorkoutSession } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { HistorySetRow } from '../components/HistorySetRow';
import { SetDisplayRow } from '../components/SetDisplayRow';
import { HistorySkeleton } from '../components/HistorySkeleton';
import { useWorkoutHistory, useLogSet } from '../hooks';

export interface HistoryScreenProps {
  onBack: () => void;
}

export const HistoryScreen = ({ onBack }: HistoryScreenProps) => {
  const { history, loading, refreshHistory } = useWorkoutHistory();
  const { updateSet, deleteSet } = useLogSet();
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const isExpanded = (id: string) => expandedIds.includes(id);
  const allExpanded = history.length > 0 && expandedIds.length === history.length;
  const toggleWorkout = (id: string) => {
    setExpandedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const expandOrCollapseAll = () => {
    if (allExpanded) setExpandedIds([]);
    else setExpandedIds(history.map((w: GlobalWorkoutSession) => w.id));
  };

  return (
    <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="min-h-screen bg-zinc-950">
      <ScreenHeader title="История" onBack={onBack} />
      <div className="p-4 space-y-4 pb-20">
        {loading && <HistorySkeleton />}
        {!loading && history.length > 0 && (
          <>
          <div className="flex justify-center pb-2">
            <button
              onClick={expandOrCollapseAll}
              className="w-full max-w-xs text-sm font-semibold text-blue-400 hover:text-blue-300 py-2.5 px-4 rounded-xl bg-blue-500/15 border border-blue-500/30 active:bg-blue-500/25"
            >
              {allExpanded ? 'Свернуть все тренировки' : 'Развернуть все тренировки'}
            </button>
          </div>
        {history.map((w: GlobalWorkoutSession) => (
          <Card key={w.id} className="overflow-hidden">
            <div onClick={() => toggleWorkout(w.id)} className="p-4 flex items-center justify-between cursor-pointer active:bg-zinc-800/50">
              <div>
                <div className="text-zinc-200 font-medium">{w.date} {w.muscleGroups.join(' · ')}</div>
              </div>
              <svg className={`w-5 h-5 text-zinc-500 transition-transform flex-shrink-0 ${isExpanded(w.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
            <AnimatePresence>
              {isExpanded(w.id) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-zinc-800 bg-zinc-900/30 overflow-hidden"
                >
                  {w.exercises && w.exercises.length > 0 ? (
                    w.exercises.map((ex: { name: string; exerciseId?: string; setGroupId?: string; sets: { id?: string; weight?: number; reps?: number; rest?: number; exerciseId?: string; setGroupId?: string; order?: number }[]; supersetId?: string }, i: number) => {
                      const isSuperset = !!ex.supersetId;
                      const prevSupersetId = i > 0 ? w.exercises[i - 1]?.supersetId : null;
                      const nextSupersetId = i < w.exercises.length - 1 ? w.exercises[i + 1]?.supersetId : null;
                      const isSupersetStart = isSuperset && prevSupersetId !== ex.supersetId;
                      const isSupersetMiddle = isSuperset && prevSupersetId === ex.supersetId && nextSupersetId === ex.supersetId;
                      let borderClass = "border-b border-zinc-800/50";
                      let paddingClass = "p-4";
                      let supersetIndicator = null;
                      if (isSuperset) {
                        borderClass = "border-l-2 border-l-blue-500 border-b border-zinc-800/50 bg-blue-500/5";
                        if (isSupersetStart) supersetIndicator = <div className="text-xs text-blue-400 font-bold mb-2 flex items-center"><LinkIcon className="w-3 h-3 mr-1" /> СУПЕРСЕТ</div>;
                        if (isSupersetMiddle) borderClass = "border-l-2 border-l-blue-500 border-b-0 bg-blue-500/5";
                      }
                      return (
                        <div key={i} className={`${paddingClass} ${borderClass} last:border-b-0`}>
                          {supersetIndicator}
                          <div className="font-medium text-zinc-300 text-sm mb-1">{ex.name}</div>
                          {ex.sets && Array.isArray(ex.sets) && ex.sets.length > 0 ? (
                            <div className="space-y-0">
                              {ex.sets.map((s: { id?: string; weight?: number; reps?: number; rest?: number; exerciseId?: string; setGroupId?: string; order?: number }, j: number) => {
                                const weight = typeof s.weight === 'number' ? s.weight : (s.weight ? parseFloat(String(s.weight)) : 0);
                                const reps = typeof s.reps === 'number' ? s.reps : (s.reps ? parseInt(String(s.reps)) : 0);
                                const rest = typeof s.rest === 'number' ? s.rest : (s.rest ? parseFloat(String(s.rest)) : 0);
                                const isLastSet = j === ex.sets!.length - 1;
                                const setBorderClass = isLastSet && !isSuperset ? '' : 'border-b border-zinc-800/50';
                                const hasId = !!s.id;
                                return hasId ? (
                                  <HistorySetRow
                                    key={s.id || j}
                                    set={{ id: s.id!, weight, reps, rest, exerciseId: s.exerciseId, setGroupId: s.setGroupId, order: s.order, set_type: (s as any).set_type, rpe: (s as any).rpe, rir: (s as any).rir, updated_at: (s as { updated_at?: string }).updated_at }}
                                    className={`py-2 px-3 ${setBorderClass}`}
                                    onSave={async (updates) => {
                                      const res = await updateSet({
                                        row_number: s.id!,
                                        exercise_id: s.exerciseId || ex.exerciseId || '',
                                        set_group_id: s.setGroupId || ex.setGroupId || '',
                                        order: s.order ?? j,
                                        weight: updates.weight,
                                        reps: updates.reps,
                                        rest: updates.rest,
                                        updated_at: (s as { updated_at?: string }).updated_at
                                      });
                                      if (res?.status === 'conflict') {
                                        alert((res as { error?: string }).error || 'Запись изменена на другом устройстве. Обновите страницу.');
                                        refreshHistory();
                                      }
                                    }}
                                    onDelete={s.id ? async () => { await deleteSet(s.id!); } : undefined}
                                  />
                                ) : (
                                  <SetDisplayRow key={j} weight={weight} reps={reps} rest={rest} setType={(s as any).set_type} rpe={(s as any).rpe} rir={(s as any).rir} className={`py-2 px-3 ${setBorderClass}`} />
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-500">Нет подходов</div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-zinc-500 text-sm">Нет упражнений</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        ))}
          </>
        )}
        {!loading && history.length === 0 && <div className="text-center text-zinc-500 py-10 flex flex-col items-center"><Activity className="w-12 h-12 mb-3 opacity-20" /><p>Нет данных</p></div>}
      </div>
    </motion.div>
  );
};
