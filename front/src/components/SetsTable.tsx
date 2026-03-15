import type { ReactNode } from 'react';

export interface SetsTableSet {
  weight: number;
  reps: number;
  rest: number;
  set_type?: string;
  rpe?: number;
  rir?: number;
  id?: string;
  [key: string]: unknown;
}

interface SetsTableProps {
  sets: SetsTableSet[];
  /** Custom row renderer (for editable rows in HistoryScreen). Receives set + 0-based index. */
  renderRow?: (set: SetsTableSet, index: number) => ReactNode;
  className?: string;
}

export function SetsTable({ sets, renderRow, className = '' }: SetsTableProps) {
  if (!sets || sets.length === 0) {
    return <div className="text-xs text-zinc-500 py-2">Нет подходов</div>;
  }

  const maxWeight = Math.max(...sets.map((s) => s.weight));
  const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
  const totalSets = sets.length;
  const totalReps = sets.reduce((sum, s) => sum + s.reps, 0);

  return (
    <div className={className}>
      {/* Header */}
      <div className="grid grid-cols-[2rem_1fr_1fr_1fr] text-[11px] uppercase tracking-wider text-zinc-500 font-semibold px-3 pb-1.5 border-b border-zinc-800/60">
        <span>#</span>
        <span className="text-center">Вес</span>
        <span className="text-center">Повт.</span>
        <span className="text-right">Отдых</span>
      </div>

      {/* Rows */}
      {sets.map((set, i) => {
        if (renderRow) return renderRow(set, i);

        const isWarmup = set.set_type === 'warmup';

        return (
          <div
            key={i}
            className={`grid grid-cols-[2rem_1fr_1fr_1fr] items-center px-3 py-1.5 text-sm ${
              i % 2 === 1 ? 'bg-zinc-800/20' : ''
            } ${isWarmup ? 'text-zinc-500' : 'text-zinc-300'}`}
          >
            {/* # */}
            <span className="tabular-nums text-zinc-500 text-xs">{i + 1}</span>

            {/* Weight */}
            <span className="text-center">
              <span className={`tabular-nums font-bold ${isWarmup ? 'text-zinc-400' : 'text-zinc-100'}`}>
                {set.weight}
              </span>
              <span className="text-zinc-500 text-xs ml-1">кг</span>
            </span>

            {/* Reps */}
            <span className="text-center tabular-nums font-medium">{set.reps}</span>

            {/* Rest */}
            <span className="text-right tabular-nums text-zinc-500 text-xs">
              {set.rest > 0 ? `${set.rest} м` : '—'}
            </span>
          </div>
        );
      })}

      {/* Footer summary */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 px-3 py-2 border-t border-zinc-800/60 text-xs text-zinc-500">
        <span>
          Макс: <strong className="text-zinc-300">{maxWeight} кг</strong>
        </span>
        <span>
          Объём: <strong className="text-zinc-300">{totalVolume.toLocaleString('ru-RU')} кг</strong>
        </span>
        <span>
          {totalSets} подх. · {totalReps} повт.
        </span>
      </div>
    </div>
  );
}
