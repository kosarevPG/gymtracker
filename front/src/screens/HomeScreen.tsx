import React from 'react';
import { Search, ChevronRight, Dumbbell, BarChart3, History as HistoryIcon, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, Button, Input } from '../ui';

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

export const HomeScreen = ({ groups, onSearch, onSelectGroup, onAllExercises, onHistory, onAnalytics, onSettings, searchQuery }: HomeScreenProps) => (
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
