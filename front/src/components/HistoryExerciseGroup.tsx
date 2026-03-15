import { memo } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { HistorySetRow } from './HistorySetRow';
import { SetsTable, type SetsTableSet } from './SetsTable';

export interface HistorySetData {
  id?: string;
  weight?: number;
  reps?: number;
  rest?: number;
  exerciseId?: string;
  setGroupId?: string;
  order?: number;
  set_type?: string;
  rpe?: number;
  rir?: number;
  updated_at?: string;
}

export interface HistoryExerciseData {
  name: string;
  exerciseId?: string;
  setGroupId?: string;
  sets: HistorySetData[];
  supersetId?: string;
}

interface HistoryExerciseGroupProps {
  group: HistoryExerciseData;
  prevSupersetId: string | null;
  nextSupersetId: string | null;
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

export const HistoryExerciseGroup = memo(function HistoryExerciseGroup({
  group,
  prevSupersetId,
  nextSupersetId,
  onUpdateSet,
  onDeleteSet,
  onRefresh,
}: HistoryExerciseGroupProps) {
  const isSuperset = !!group.supersetId;
  const isSupersetStart = isSuperset && prevSupersetId !== group.supersetId;
  const isSupersetMiddle = isSuperset && prevSupersetId === group.supersetId && nextSupersetId === group.supersetId;
  let borderClass = 'border-b border-zinc-800/50';
  const paddingClass = 'p-4';
  let supersetIndicator = null;
  if (isSuperset) {
    borderClass = 'border-l-2 border-l-blue-500 border-b border-zinc-800/50 bg-blue-500/5';
    if (isSupersetStart) supersetIndicator = <div className="text-xs text-blue-400 font-bold mb-2 flex items-center"><LinkIcon className="w-3 h-3 mr-1" /> СУПЕРСЕТ</div>;
    if (isSupersetMiddle) borderClass = 'border-l-2 border-l-blue-500 border-b-0 bg-blue-500/5';
  }

  // Normalize sets for SetsTable
  const normalizedSets: SetsTableSet[] = (group.sets || []).map((s) => ({
    ...s,
    weight: typeof s.weight === 'number' ? s.weight : (s.weight ? parseFloat(String(s.weight)) : 0),
    reps: typeof s.reps === 'number' ? s.reps : (s.reps ? parseInt(String(s.reps)) : 0),
    rest: typeof s.rest === 'number' ? s.rest : (s.rest ? parseFloat(String(s.rest)) : 0),
  }));

  return (
    <div className={`${paddingClass} ${borderClass} last:border-b-0`}>
      {supersetIndicator}
      <div className="font-medium text-zinc-300 text-sm mb-1">{group.name}</div>
      {normalizedSets.length > 0 ? (
        <SetsTable
          sets={normalizedSets}
          renderRow={(set, j) => {
            const s = group.sets[j];
            const hasId = !!s.id;
            return hasId ? (
              <HistorySetRow
                key={s.id || j}
                set={{
                  id: s.id!,
                  weight: set.weight,
                  reps: set.reps,
                  rest: set.rest,
                  exerciseId: s.exerciseId,
                  setGroupId: s.setGroupId,
                  order: s.order,
                  set_type: s.set_type,
                  rpe: s.rpe,
                  rir: s.rir,
                  updated_at: s.updated_at,
                }}
                className={`py-1.5 px-3 ${j % 2 === 1 ? 'bg-zinc-800/20' : ''}`}
                onSave={async (updates) => {
                  const res = await onUpdateSet({
                    row_number: s.id!,
                    exercise_id: s.exerciseId || group.exerciseId || '',
                    set_group_id: s.setGroupId || group.setGroupId || '',
                    order: s.order ?? j,
                    weight: updates.weight,
                    reps: updates.reps,
                    rest: updates.rest,
                    updated_at: s.updated_at,
                  });
                  if (res?.status === 'conflict') {
                    alert(res.error || 'Запись изменена на другом устройстве. Обновите страницу.');
                    onRefresh();
                  }
                }}
                onDelete={s.id ? () => onDeleteSet(s.id!) : undefined}
              />
            ) : (
              <div
                key={j}
                className={`grid grid-cols-[2rem_1fr_1fr_1fr] items-center px-3 py-1.5 text-sm ${
                  j % 2 === 1 ? 'bg-zinc-800/20' : ''
                } text-zinc-300`}
              >
                <span className="tabular-nums text-zinc-500 text-xs">{j + 1}</span>
                <span className="text-center">
                  <span className="tabular-nums font-bold text-zinc-100">{set.weight}</span>
                  <span className="text-zinc-500 text-xs ml-1">кг</span>
                </span>
                <span className="text-center tabular-nums font-medium">{set.reps}</span>
                <span className="text-right tabular-nums text-zinc-500 text-xs">
                  {set.rest > 0 ? `${set.rest} м` : '—'}
                </span>
              </div>
            );
          }}
        />
      ) : (
        <div className="text-xs text-zinc-500">Нет подходов</div>
      )}
    </div>
  );
});
