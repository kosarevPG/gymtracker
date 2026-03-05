import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useExerciseHistory } from '../hooks';
import { AlertTriangle, Activity, BarChart3, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, Button } from '../ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { AnalyticsSkeleton } from '../components/AnalyticsSkeleton';
import { api } from '../api';
import type { Exercise } from '../types';

const MUSCLE_ORDER = ['Спина', 'Ноги', 'Грудь', 'Плечи', 'Трицепс', 'Бицепс', 'Пресс', 'Кардио'];

interface VolumeE1rmPoint {
  date: string;
  volume: number;
  e1rm: number;
}

const CHART_COLORS = { volume: '#3b82f6', e1rm: '#f59e0b' };

function VolumeE1rmChart({ data }: { data: VolumeE1rmPoint[] }) {
  if (data.length === 0) return null;
  const chartData = data.map((d) => ({
    ...d,
    dateShort: d.date.split('.').slice(-2).join('.'),
    volumeLabel: d.volume > 0 ? `${Math.round(d.volume).toLocaleString('ru')} кг` : '',
    e1rmLabel: d.e1rm > 0 ? `${Math.round(d.e1rm)} кг` : '',
  }));

  return (
    <div className="w-full h-[280px] overflow-x-auto min-w-[320px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
          <XAxis dataKey="dateShort" tick={{ fill: '#71717a', fontSize: 12 }} stroke="#52525b" />
          <YAxis yAxisId="left" tick={{ fill: '#71717a', fontSize: 11 }} stroke="#52525b" tickFormatter={(v) => `${v}`} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#f59e0b', fontSize: 11 }} stroke="#52525b" tickFormatter={(v) => `${v}`} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #3f3f46', borderRadius: '8px' }}
            labelStyle={{ color: '#a1a1aa' }}
            formatter={(value, name) => [
              value != null ? (name === 'volume' ? `${Math.round(Number(value)).toLocaleString('ru')} кг` : `${Math.round(Number(value))} кг`) : '—',
              name === 'volume' ? 'Тоннаж' : 'e1RM',
            ]}
            labelFormatter={(label) => `Дата: ${label}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => (value === 'volume' ? 'Тоннаж' : 'e1RM')}
            iconType="square"
          />
          <Bar yAxisId="left" dataKey="volume" fill={CHART_COLORS.volume} fillOpacity={0.7} radius={[2, 2, 0, 0]} name="volume" isAnimationActive={false} />
          <Line yAxisId="right" type="monotone" dataKey="e1rm" stroke={CHART_COLORS.e1rm} strokeWidth={2} dot={{ r: 4, fill: CHART_COLORS.e1rm }} connectNulls name="e1rm" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function calcE1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps <= 5) return weight * (1 + reps / 30);
  if (reps <= 10) {
    const denom = 1.0278 - 0.0278 * reps;
    return denom <= 0 ? weight : weight / denom;
  }
  return weight * (1 + reps / 30);
}

interface AnalyticsData {
  volume?: number;
  acwr?: { acute: number; chronic: number; ratio: number; status: string };
  muscleVolume?: Record<string, number>;
  muscleSets?: Record<string, number>;
}

export interface AnalyticsScreenProps {
  exercises?: Exercise[];
  onBack: () => void;
}

function buildVolumeE1rmPoints(history: { date: string; sets?: { weight: number; reps: number; set_type?: string }[] }[], period: number): VolumeE1rmPoint[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - period);
  const cutoffStr = cutoff.toISOString().slice(0, 10).replace(/-/g, '.');
  const points: VolumeE1rmPoint[] = [];
  for (const day of history) {
    const d = day.date.replace(/-/g, '.');
    if (d < cutoffStr) continue;
    let volume = 0;
    let maxE1rm = 0;
    for (const s of day.sets || []) {
      const st = (s.set_type || '').toLowerCase();
      if (st && st !== 'working') continue;
      const w = Number(s.weight) || 0;
      const r = Number(s.reps) || 0;
      volume += w * r;
      const e = calcE1rm(w, r);
      if (e > maxE1rm) maxE1rm = e;
    }
    points.push({ date: d, volume, e1rm: maxE1rm });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

export const AnalyticsScreen = ({ exercises = [], onBack }: AnalyticsScreenProps) => {
  const [period, setPeriod] = useState(14);
  const [retry, setRetry] = useState(0);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading: loading, error: apiError } = useQuery({
    queryKey: ['analytics', period, retry],
    queryFn: async () => {
      const d = await api.getAnalytics(period);
      if (!d) throw new Error('Не удалось загрузить данные');
      if (d && 'error' in d) throw new Error((d as { error?: string }).error || 'Ошибка API');
      return d as AnalyticsData;
    },
  });

  const { history: exerciseHistory, loading: chartLoading } = useExerciseHistory(selectedExerciseId || null);
  const volumeE1rmData = useMemo(
    () => (exerciseHistory.length > 0 ? buildVolumeE1rmPoints(exerciseHistory, period) : []),
    [exerciseHistory, period]
  );

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const element = document.getElementById('pdf-report-content');
      if (!element) return;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#09090b' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('GymTracker_Report.pdf');
    } finally {
      setIsExporting(false);
    }
  };

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
        <div className="flex gap-2 px-4 pb-2">
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
        {!loading && !apiError?.message && (
          <div className="px-4 pb-3">
            <Button
              variant="secondary"
              onClick={handleExportPDF}
              disabled={isExporting}
              className="w-full h-10 flex items-center justify-center gap-2 text-sm"
            >
              <Download className="w-4 h-4" />
              {isExporting ? 'Генерация...' : 'Экспорт в PDF'}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-4">
          <AnalyticsSkeleton />
        </div>
      ) : apiError ? (
        <div className="p-4 text-center text-red-400 mt-20">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-70" />
          <p className="font-medium">{apiError.message}</p>
          <Button variant="secondary" onClick={() => setRetry(r => r + 1)} className="mt-4">Повторить</Button>
        </div>
      ) : (
        <div id="pdf-report-content" className="p-4 space-y-4 pb-20 bg-zinc-950">
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

          <Card className="p-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Объём vs e1RM
            </h2>
            <div className="mb-3">
              <label className="text-xs text-zinc-500 block mb-1">Упражнение</label>
              <select
                value={selectedExerciseId}
                onChange={(e) => setSelectedExerciseId(e.target.value)}
                className="w-full h-10 bg-zinc-800 rounded-xl px-3 text-zinc-100 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="">Выберите упражнение</option>
                {[...exercises].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
            </div>
            {chartLoading ? (
              <div className="h-48 bg-zinc-900 rounded-xl animate-pulse flex items-center justify-center">
                <span className="text-zinc-500 text-sm">Загрузка...</span>
              </div>
            ) : volumeE1rmData.length === 0 ? (
              <div className="h-48 bg-zinc-900/50 rounded-xl flex items-center justify-center border border-dashed border-zinc-700">
                <span className="text-zinc-500 text-sm">
                  {selectedExerciseId ? 'Нет данных за период' : 'Выберите упражнение'}
                </span>
              </div>
            ) : (
              <VolumeE1rmChart data={volumeE1rmData} />
            )}
          </Card>
        </div>
      )}
    </motion.div>
  );
};
