import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, Button } from '../ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../api';

const MUSCLE_ORDER = ['Спина', 'Ноги', 'Грудь', 'Плечи', 'Трицепс', 'Бицепс', 'Пресс', 'Кардио'];

interface AnalyticsData {
  volume?: number;
  acwr?: { acute: number; chronic: number; ratio: number; status: string };
  muscleVolume?: Record<string, number>;
  muscleSets?: Record<string, number>;
}

export interface AnalyticsScreenProps {
  onBack: () => void;
}

export const AnalyticsScreen = ({ onBack }: AnalyticsScreenProps) => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(14);
  const [apiError, setApiError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setLoading(true);
    setApiError(null);
    api.getAnalytics(period).then((d: AnalyticsData | { error?: string } | null) => {
      if (!d) {
        setData(null);
        setApiError('Не удалось загрузить данные');
      } else if (d && 'error' in d) {
        setData(null);
        setApiError((d as { error?: string }).error || 'Ошибка API');
      } else {
        setData(d as AnalyticsData);
      }
      setLoading(false);
    });
  }, [period, retry]);

  const muscleList = useMemo(() => {
    const sets = data?.muscleSets || {};
    const vol = data?.muscleVolume || {};
    const hasData = MUSCLE_ORDER.some(m => (sets[m] ?? 0) > 0 || (vol[m] ?? 0) > 0);
    return hasData ? MUSCLE_ORDER.filter(m => (sets[m] ?? 0) > 0 || (vol[m] ?? 0) > 0) : [...MUSCLE_ORDER];
  }, [data?.muscleSets, data?.muscleVolume]);

  const barColor = (sets: number) => {
    if (sets < 6) return 'bg-zinc-600';
    if (sets >= 10 && sets <= 15) return 'bg-green-600';
    if (sets > 20) return 'bg-red-600';
    return 'bg-zinc-500';
  };

  return (
    <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="min-h-screen bg-zinc-950">
      <div className="sticky top-0 z-30 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <ScreenHeader title="Аналитика" onBack={onBack} />
        <div className="flex gap-2 px-4 pb-3">
          {[7, 14, 28].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
            >
              {p} дн.
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-zinc-900 rounded-2xl animate-pulse" />)}
        </div>
      ) : apiError ? (
        <div className="p-4 text-center text-red-400 mt-20">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-70" />
          <p className="font-medium">{apiError}</p>
          <Button variant="secondary" onClick={() => setRetry(r => r + 1)} className="mt-4">Повторить</Button>
        </div>
      ) : (
        <div className="p-4 space-y-4 pb-20">
          {data?.acwr?.status === 'danger' && (
            <div className="p-4 rounded-xl bg-red-900/40 border border-red-700 text-red-200 text-sm font-medium flex items-center gap-2">
              <Activity className="w-5 h-5 flex-shrink-0" />
              ACWR {data.acwr.ratio} — риск перетренированности. Снизьте нагрузку.
            </div>
          )}

          <Card className="p-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase mb-3">Тоннаж по мышцам (подходы)</h2>
            <div className="space-y-3">
              {muscleList.map((m) => {
                const sets = (data?.muscleSets || {})[m] ?? 0;
                const pct = Math.min(100, (sets / 20) * 100);
                return (
                  <div key={m} className="flex items-center gap-3">
                    <span className="text-zinc-300 w-24 text-sm">{m}</span>
                    <div className="flex-1 h-6 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor(sets)}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-zinc-500 text-sm w-8">{sets}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase mb-3">Объём нагрузки</h2>
            <div className="text-2xl font-bold text-zinc-50">{(data?.volume ?? 0).toLocaleString('ru')} кг</div>
            {data?.acwr && (
              <div className="mt-2 text-sm text-zinc-400">
                ACWR: {data.acwr.ratio} (острая: {data.acwr.acute?.toLocaleString()}, хроническая: {data.acwr.chronic?.toLocaleString()})
              </div>
            )}
          </Card>
        </div>
      )}
    </motion.div>
  );
};
