import type { useTimer } from '../hooks/useTimer';
import { Card, Button } from '../ui';

interface TimerBlockProps {
  timer: ReturnType<typeof useTimer>;
  onToggle: () => void;
  sessionTonnage?: number;
}

export const TimerBlock = ({ timer, onToggle, sessionTonnage = 0 }: TimerBlockProps) => {
  const minutes = timer.time / 60;
  const density = minutes > 0 ? Math.round(sessionTonnage / minutes) : 0;
  return (
    <div className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md pb-4 pt-2 px-4 border-b border-zinc-800/50 mb-4">
      <Card className="flex items-center justify-between p-3 px-5 shadow-xl shadow-black/50">
        <div>
          <div className="font-mono text-3xl font-bold tracking-wider text-zinc-50 tabular-nums">{timer.formatTime(timer.time)}</div>
          {sessionTonnage > 0 && <div className="text-xs text-zinc-500 mt-1">Плотность: {density} кг/мин</div>}
        </div>
        <div className="flex gap-2">
          <Button variant={timer.isRunning ? "danger" : "primary"} onClick={onToggle} className="w-20 h-10 text-sm">{timer.isRunning ? "Стоп" : "Старт"}</Button>
        </div>
      </Card>
    </div>
  );
};
