type SetType = 'warmup' | 'working' | 'drop' | 'failure';

interface SetDisplayRowProps {
  weight: number | string;
  reps: number | string;
  rest: number | string;
  setType?: SetType | string;
  rpe?: number;
  rir?: number;
  className?: string;
}

export function SetDisplayRow({ weight, reps, rest, setType, rpe, rir, className = '' }: SetDisplayRowProps) {
  const isWarmup = setType === 'warmup';

  return (
    <div className={`flex items-center gap-1.5 text-sm ${isWarmup ? 'text-zinc-500' : 'text-zinc-300'} ${className}`}>
      {/* Блок веса: фиксированная ширина 48px (w-12), выравнивание по правому краю */}
      <span className={`w-12 text-right tabular-nums text-lg font-bold ${isWarmup ? 'text-zinc-400' : 'text-zinc-100'}`}>
        {weight}
      </span>
      <span className="text-zinc-500 text-xs w-4">кг</span>

      <span className="text-zinc-700 mx-0.5">×</span>

      {/* Блок повторений: фиксированная ширина 24px (w-6) */}
      <span className="w-6 text-right tabular-nums font-medium text-zinc-200">
        {reps}
      </span>
      <span className="text-zinc-500 text-xs w-6">повт</span>

      {/* Отдых (если есть) */}
      {rest != null && Number(rest) > 0 && (
        <span className="text-zinc-600 text-xs ml-1 flex items-center tabular-nums">
          <span className="mr-0.5">⏱</span>{rest}м
        </span>
      )}

      {/* Бейджи: ml-auto прижимает их к правому краю карточки */}
      <div className="ml-auto flex items-center gap-1.5">
        {isWarmup && (
          <span className="text-[10px] uppercase tracking-wider bg-zinc-800/80 text-zinc-400 px-1.5 py-0.5 rounded">
            Разминка
          </span>
        )}
        {rpe != null && Number(rpe) > 0 && (
          <span className="text-[10px] font-medium text-orange-400/90 border border-orange-400/20 bg-orange-400/5 px-1.5 py-0.5 rounded">
            RPE {rpe}
          </span>
        )}
        {rir != null && Number(rir) >= 0 && (
          <span className="text-[10px] font-medium text-blue-400/90 border border-blue-400/20 bg-blue-400/5 px-1.5 py-0.5 rounded">
            RIR {rir}
          </span>
        )}
      </div>
    </div>
  );
}
