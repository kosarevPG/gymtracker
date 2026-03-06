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
    <div className={`flex items-center text-sm ${isWarmup ? 'text-zinc-500' : 'text-zinc-300'} ${className}`}>
      {/* 1. ВЕС: Строго фиксированная ширина 64px (w-16) + запрет сжатия (shrink-0) */}
      <div className="w-16 shrink-0 text-right pr-1">
        <span className={`tabular-nums text-lg font-bold ${isWarmup ? 'text-zinc-400' : 'text-zinc-100'}`}>
          {weight}
        </span>
      </div>
      <div className="w-5 shrink-0 text-zinc-500 text-xs">кг</div>

      {/* Значок умножения */}
      <div className="w-4 shrink-0 text-center text-zinc-700 mx-1.5">×</div>

      {/* 2. ПОВТОРЕНИЯ: Строго фиксированная ширина 32px (w-8) */}
      <div className="w-8 shrink-0 text-right pr-1">
        <span className="tabular-nums font-medium text-zinc-200">
          {reps}
        </span>
      </div>
      <div className="w-9 shrink-0 text-zinc-500 text-xs">повт</div>

      {/* 3. ОТДЫХ: Отводим ему 48px */}
      <div className="w-12 shrink-0 ml-1">
        {rest != null && Number(rest) > 0 && (
          <span className="text-zinc-600 text-xs tabular-nums flex items-center">
            <span className="mr-0.5">⏱</span>{rest}м
          </span>
        )}
      </div>

      {/* 4. БЕЙДЖИ: flex-1 толкает их в самый правый край экрана */}
      <div className="flex-1 flex justify-end items-center gap-1 min-w-0">
        {isWarmup && (
          <span className="text-[10px] uppercase tracking-wider bg-zinc-800/80 text-zinc-400 px-1.5 py-0.5 rounded truncate">
            Разминка
          </span>
        )}
        {rpe != null && Number(rpe) > 0 && (
          <span className="text-[10px] font-medium text-orange-400/90 border border-orange-400/20 bg-orange-400/5 px-1.5 py-0.5 rounded truncate">
            RPE {rpe}
          </span>
        )}
        {rir != null && Number(rir) >= 0 && (
          <span className="text-[10px] font-medium text-blue-400/90 border border-blue-400/20 bg-blue-400/5 px-1.5 py-0.5 rounded truncate">
            RIR {rir}
          </span>
        )}
      </div>
    </div>
  );
}
