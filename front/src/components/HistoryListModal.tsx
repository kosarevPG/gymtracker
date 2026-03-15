import { Calendar, Link as LinkIcon } from 'lucide-react';
import { Modal } from '../ui';
import { SetsTable } from './SetsTable';
import { useExerciseHistory } from '../hooks';

export const HistoryListModal = ({ isOpen, onClose, exerciseId, exerciseName }: { isOpen: boolean; onClose: () => void; exerciseId: string | null; exerciseName: string }) => {
  const { history } = useExerciseHistory(isOpen ? exerciseId : null);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`История: ${exerciseName}`}>
      <div className="space-y-6">
        {history.map((group: any, idx: number) => {
          if (group.isSuperset && group.exercises) {
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
                      <SetsTable sets={ex.sets} />
                    </div>
                  ))}
                </div>
              </div>
            );
          } else {
            return (
              <div key={idx}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-zinc-900 py-1 z-10">
                  <Calendar className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{group.date}</span>
                </div>
                <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl overflow-hidden">
                  <SetsTable sets={group.sets} />
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
