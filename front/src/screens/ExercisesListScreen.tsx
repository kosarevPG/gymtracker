import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input, Modal, StickyBottomBar, Button } from '../ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { ExerciseCard } from '../components/ExerciseCard';
import type { Exercise } from '../types';

export interface ExercisesListScreenProps {
  exercises: Exercise[];
  title: string;
  searchQuery: string;
  allExercises: Exercise[];
  onBack: () => void;
  onSelectExercise: (ex: Exercise) => void;
  onAddExercise: () => void;
  onSearch: (q: string) => void;
}

export const ExercisesListScreen = ({
  exercises,
  title,
  onBack,
  onSelectExercise,
  onAddExercise,
  searchQuery,
  onSearch,
  allExercises
}: ExercisesListScreenProps) => {
  const [infoModalExId, setInfoModalExId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const infoModalEx = infoModalExId ? allExercises.find((ex) => ex.id === infoModalExId) || null : null;

  useEffect(() => {
    if (searchQuery && searchInputRef.current) {
      searchInputRef.current.focus();
      const length = searchInputRef.current.value.length;
      searchInputRef.current.setSelectionRange(length, length);
    }
  }, [searchQuery]);

  return (
    <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex flex-col h-full">
      <ScreenHeader
        title={title}
        onBack={onBack}
      >
        {searchQuery ? (
          <div className="relative flex-1">
            <Input
              ref={searchInputRef}
              placeholder="Найти..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
              className="bg-zinc-900 w-full text-sm"
            />
          </div>
        ) : (
          <h1 className="text-xl font-bold truncate">{title}</h1>
        )}
      </ScreenHeader>
      <div className="p-4 space-y-2 pb-28">
        {exercises.map((ex) => (
          <ExerciseCard key={ex.id} ex={ex} onSelectExercise={onSelectExercise} onInfoClick={(e) => setInfoModalExId(e.id)} />
        ))}
      </div>
      <Modal isOpen={!!infoModalEx} onClose={() => setInfoModalExId(null)} title={infoModalEx?.name || ''}>
        {infoModalEx && (
          <div className="space-y-4">
            <div className="aspect-square bg-zinc-800 rounded-2xl overflow-hidden">
              {infoModalEx.imageUrl ? (
                <img src={infoModalEx.imageUrl} className="w-full h-full object-cover" alt="Основное фото" onError={() => {}} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500">Нет фото</div>
              )}
            </div>
            {infoModalEx.imageUrl2 && infoModalEx.imageUrl2.trim() !== '' ? (
              <div className="aspect-square bg-zinc-800 rounded-2xl overflow-hidden">
                <img src={infoModalEx.imageUrl2} className="w-full h-full object-cover" alt="Дополнительное фото" onError={() => {}} />
              </div>
            ) : (
              <div className="text-xs text-zinc-500 text-center py-2">Дополнительное фото отсутствует</div>
            )}
            <div className="text-zinc-400 leading-relaxed">{infoModalEx.description || 'Описание отсутствует.'}</div>
            <div className="pt-4"><div className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-2">Группа</div><div className="px-3 py-1 bg-zinc-800 rounded-lg inline-block text-zinc-300 text-sm">{infoModalEx.muscleGroup}</div></div>
          </div>
        )}
      </Modal>
      <StickyBottomBar>
        <Button variant="primary" onClick={onAddExercise} className="w-full" icon={Plus}>Добавить упражнение</Button>
      </StickyBottomBar>
    </motion.div>
  );
};
