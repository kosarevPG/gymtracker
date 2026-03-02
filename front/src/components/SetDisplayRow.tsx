interface SetDisplayRowProps {
  weight: number | string;
  reps: number | string;
  rest: number | string;
  className?: string;
}

export function SetDisplayRow({ weight, reps, rest, className = '' }: SetDisplayRowProps) {
  return (
    <div className={`text-left text-sm text-zinc-200 ${className}`}>
      {weight} <span className="text-zinc-500">кг</span> х {reps} <span className="text-zinc-500">повт</span>, {rest}м
    </div>
  );
}
