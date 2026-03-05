import { useState } from 'react';
import { Activity } from 'lucide-react';
import type { GlobalWorkoutSession } from '../types';
import { motion } from 'framer-motion';
import { ScreenHeader } from '../components/ScreenHeader';
import { HistoryWorkoutCard } from '../components/HistoryWorkoutCard';
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
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
                className="w-full max-w-xs text-sm font-semibold text-blue-400 hover:text-blue-300 min-h-[48px] px-4 rounded-xl bg-blue-500/15 border border-blue-500/30 active:bg-blue-500/25"
              >
                {allExpanded ? 'Свернуть все тренировки' : 'Развернуть все тренировки'}
              </button>
            </div>
            {history.map((w: GlobalWorkoutSession) => (
              <HistoryWorkoutCard
                key={w.id}
                session={w}
                isExpanded={isExpanded(w.id)}
                onToggle={() => toggleWorkout(w.id)}
                onUpdateSet={updateSet}
                onDeleteSet={async (id) => { await deleteSet(id); }}
                onRefresh={refreshHistory}
              />
            ))}
          </>
        )}
        {!loading && history.length === 0 && (
          <div className="text-center text-zinc-500 py-10 flex flex-col items-center">
            <Activity className="w-12 h-12 mb-3 opacity-20" />
            <p>Нет данных</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};
