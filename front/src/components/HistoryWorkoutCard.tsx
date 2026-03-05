import { memo } from 'react';
import type { GlobalWorkoutSession } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../ui';
import { HistoryExerciseGroup, type HistoryExerciseData } from './HistoryExerciseGroup';

interface HistoryWorkoutCardProps {
  session: GlobalWorkoutSession;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateSet: (params: {
    row_number: string;
    exercise_id: string;
    set_group_id: string;
    order: number;
    weight: number;
    reps: number;
    rest: number;
    updated_at?: string;
  }) => Promise<{ status?: string; error?: string } | null>;
  onDeleteSet: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export const HistoryWorkoutCard = memo(function HistoryWorkoutCard({
  session,
  isExpanded,
  onToggle,
  onUpdateSet,
  onDeleteSet,
  onRefresh,
}: HistoryWorkoutCardProps) {
  const exercises = (session.exercises || []) as HistoryExerciseData[];

  return (
    <Card className="overflow-hidden">
      <div onClick={onToggle} className="p-4 flex items-center justify-between cursor-pointer active:bg-zinc-800/50">
        <div>
          <div className="text-zinc-200 font-medium">{session.date} {session.muscleGroups.join(' · ')}</div>
        </div>
        <svg className={`w-5 h-5 text-zinc-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-zinc-800 bg-zinc-900/30 overflow-hidden"
          >
            {exercises.length > 0 ? (
              exercises.map((ex, i) => (
                <HistoryExerciseGroup
                  key={`${ex.exerciseId || ex.name}-${i}`}
                  group={ex}
                  prevSupersetId={i > 0 ? exercises[i - 1]?.supersetId ?? null : null}
                  nextSupersetId={i < exercises.length - 1 ? exercises[i + 1]?.supersetId ?? null : null}
                  onUpdateSet={onUpdateSet}
                  onDeleteSet={onDeleteSet}
                  onRefresh={onRefresh}
                />
              ))
            ) : (
              <div className="p-4 text-center text-zinc-500 text-sm">Нет упражнений</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
});
