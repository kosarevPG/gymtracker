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
    <div className={`text-left text-sm ${isWarmup ? 'text-zinc-500' : 'text-zinc-200'} ${className}`}>
      <span className="tabular-nums text-xl text-zinc-100 font-bold">{weight}</span> <span className="text-zinc-500">кг</span> × <span className="tabular-nums">{reps}</span> <span className="text-zinc-500">повт</span>, <span className="tabular-nums">{rest}</span>
      <span className="text-zinc-500">м</span>
      {isWarmup && <span className="ml-2 text-xs bg-zinc-800 px-1.5 py-0.5 rounded">Разминка</span>}
      {rpe != null && Number(rpe) > 0 && <span className="ml-2 text-xs text-orange-400">RPE {rpe}</span>}
      {rir != null && Number(rir) >= 0 && <span className="ml-2 text-xs text-zinc-400">RIR {rir}</span>}
    </div>
  );
}
