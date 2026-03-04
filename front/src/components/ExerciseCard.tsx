import React from 'react';
import { Info, Settings, ChevronRight } from 'lucide-react';
import type { Exercise } from '../types';

interface ExerciseCardProps {
  ex: Exercise;
  onSelectExercise: (ex: Exercise) => void;
  onInfoClick: (ex: Exercise) => void;
}

export const ExerciseCard = React.memo(({ ex, onSelectExercise, onInfoClick }: ExerciseCardProps) => (
  <div className="flex items-center p-2 rounded-2xl hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all">
    <div onClick={(e) => { e.stopPropagation(); onInfoClick(ex); }} className="w-14 h-14 rounded-xl bg-zinc-800 flex-shrink-0 overflow-hidden cursor-pointer active:scale-90 transition-transform relative group">
      {ex.imageUrl ? <img src={ex.imageUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600"><Info className="w-6 h-6" /></div>}
      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Settings className="w-5 h-5 text-white" /></div>
    </div>
    <div onClick={() => onSelectExercise(ex)} className="flex-1 px-4 cursor-pointer">
      <div className="font-medium text-zinc-100 text-[17px]">{ex.name}</div>
      <div className="text-xs text-zinc-500">{ex.muscleGroup}</div>
    </div>
    <button onClick={() => onSelectExercise(ex)} className="p-2 text-zinc-600"><ChevronRight className="w-5 h-5" /></button>
  </div>
), (prevProps, nextProps) =>
  prevProps.ex.id === nextProps.ex.id &&
  prevProps.ex.name === nextProps.ex.name &&
  prevProps.ex.muscleGroup === nextProps.ex.muscleGroup &&
  prevProps.ex.imageUrl === nextProps.ex.imageUrl &&
  prevProps.ex.imageUrl2 === nextProps.ex.imageUrl2
);
