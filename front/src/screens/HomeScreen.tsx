import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronRight, Dumbbell, BarChart3, History as HistoryIcon, Settings, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, Button, Input } from '../ui';
import { api } from '../api';

const MUSCLE_ORDER = ['Спина', 'Ноги', 'Грудь', 'Плечи', 'Трицепс', 'Бицепс', 'Пресс', 'Кардио'];

export interface HomeScreenProps {
  groups: string[];
  searchQuery: string;
  onSearch: (q: string) => void;
  onSelectGroup: (g: string) => void;
  onAllExercises: () => void;
  onHistory: () => void;
  onAnalytics: () => void;
  onSettings?: () => void;
}

export const HomeScreen = ({ groups, onSearch, onSelectGroup, onAllExercises, onHistory, onAnalytics, onSettings, searchQuery }: HomeScreenProps) => {
  const { data: analytics } = useQuery({
    queryKey: ['analytics', 14],
    queryFn: async () => {
      const d = await api.getAnalytics(14);
      if (!d || (d && 'error' in d)) return null;
      return d;
    },
  });

  const acwr = analytics?.acwr;
  const muscleSets = analytics?.muscleSets || {};
  const muscleList = MUSCLE_ORDER.filter(m => (muscleSets[m] ?? 0) > 0).length > 0
    ? MUSCLE_ORDER.filter(m => (muscleSets[m] ?? 0) > 0)
    : MUSCLE_ORDER;

  const acwrColor = (status?: string) => {
    if (status === 'under') return 'bg-zinc-600/50 border-zinc-600 text-zinc-300';
    if (status === 'danger') return 'bg-red-900/40 border-red-700 text-red-200';
    return 'bg-green-900/30 border-green-700/50 text-green-200';
  };

  const muscleBarColor = (sets: number) => {
    if (sets < 6) return 'bg-zinc-600';
    if (sets >= 10 && sets <= 15) return 'bg-green-600';
    if (sets > 20) return 'bg-red-600';
    return 'bg-zinc-500';
  };

  const acwrLabel = (status?: string) => {
    if (status === 'under') return 'Низкая нагрузка';
    if (status === 'danger') return 'Риск перетренированности';
    return 'Оптимально';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-zinc-950">
      <div className="sticky top-0 z-30 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-50">Главная</h1>
        {onSettings && (
          <button onClick={onSettings} className="p-2 -mr-2 text-zinc-400 hover:text-blue-500 transition-colors" title="Настройки">
            <Settings className="w-6 h-6" />
          </button>
        )}
      </div>
      <div className="p-4 space-y-6">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <Input placeholder="Найти..." value={searchQuery || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)} className="pl-12 bg-zinc-900 w-full" />
          </div>
          <button onClick={onAnalytics} className="p-3 bg-zinc-900 rounded-xl text-zinc-400 hover:text-blue-500"><BarChart3 className="w-6 h-6" /></button>
          <button onClick={onHistory} className="p-3 bg-zinc-900 rounded-xl text-zinc-400 hover:text-blue-500"><HistoryIcon className="w-6 h-6" /></button>
        </div>

        {acwr && (
          <Card className={`p-4 border ${acwrColor(acwr.status)}`}>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 flex-shrink-0" />
              <span className="font-bold">ACWR</span>
              <span className="text-sm opacity-90">({acwrLabel(acwr.status)})</span>
            </div>
            <div className="text-sm opacity-90">
              Коэффициент: {acwr.ratio} · Острая: {acwr.acute?.toLocaleString()} кг · Хроническая: {acwr.chronic?.toLocaleString()} кг
            </div>
          </Card>
        )}

        {Object.keys(muscleSets).length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase mb-3">Нагрузка по мышцам (за 14 дн.)</h2>
            <div className="space-y-2">
              {muscleList.slice(0, 6).map((m) => {
                const sets = muscleSets[m] ?? 0;
                const pct = Math.min(100, (sets / 20) * 100);
                return (
                  <div key={m} className="flex items-center gap-3">
                    <span className="text-zinc-300 w-20 text-sm truncate">{m}</span>
                    <div className="flex-1 h-4 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${muscleBarColor(sets)}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-zinc-500 text-xs w-6">{sets}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div className="flex flex-col space-y-2">
          {groups.map((group) => (
            <Card key={group} onClick={() => onSelectGroup(group)} className="flex items-center p-4 hover:bg-zinc-800 transition-colors active:scale-95 cursor-pointer">
              <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 flex-shrink-0"><Dumbbell className="w-6 h-6" /></div>
              <span className="font-medium text-zinc-200 text-lg ml-4 flex-1">{group}</span>
              <ChevronRight className="w-6 h-6 text-zinc-600" />
            </Card>
          ))}
        </div>
        <Button onClick={onAllExercises} variant="secondary" className="w-full h-14 text-lg">Все упражнения</Button>
      </div>
    </motion.div>
  );
};
