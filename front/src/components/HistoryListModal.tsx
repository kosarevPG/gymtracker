import { Calendar, Link as LinkIcon } from 'lucide-react';
import { Modal } from '../ui';
import { SetDisplayRow } from './SetDisplayRow';
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
