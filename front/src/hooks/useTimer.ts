import { useState, useRef } from 'react';

export const useTimer = () => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    if (isRunning) return;
    setIsRunning(true);
    const startTime = Date.now() - time;
    intervalRef.current = setInterval(() => setTime(Date.now() - startTime), 50);
  };
  const pause = () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };
  const reset = () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTime(0);
  };
  const resetAndStart = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTime(0);
    setIsRunning(true);
    const startTime = Date.now();
    intervalRef.current = setInterval(() => setTime(Date.now() - startTime), 50);
  };
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    const ms2 = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
    return `${m}:${s}.${ms2}`;
  };
  return { time, isRunning, start, pause, reset, resetAndStart, formatTime };
};
