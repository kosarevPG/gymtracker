import { useRef } from 'react';
import { Check, Trash2, Pencil } from 'lucide-react';
import { motion } from 'framer-motion';
import { getWeightInputType, calcEffectiveWeight, WEIGHT_FORMULAS, BODY_WEIGHT_DEFAULT, allows1rm } from '../exerciseConfig';
import type { WorkoutSet, SetType } from '../types';

const SET_TYPE_ORDER: SetType[] = ['warmup', 'working', 'drop', 'failure'];
const SET_TYPE_LABEL: Record<string, string> = { warmup: 'W', working: 'R', drop: 'D', failure: 'F' };

interface SetRowProps {
  set: WorkoutSet;
  equipmentType?: string;
  weightType?: string;
  baseWeight?: number;
  weightMultiplier?: number;
  bodyWeightFactor?: number;
  onUpdate: (setId: string, field: string, value: string | number) => void;
  onDelete: (setId: string) => void;
  onComplete: (setId: string) => void;
  onToggleEdit: (setId: string) => void;
}

export const SetRow = ({ set, equipmentType, weightType: weightTypeFromRef, baseWeight, weightMultiplier, bodyWeightFactor, onUpdate, onDelete, onComplete, onToggleEdit }: SetRowProps) => {
  const repsRef = useRef<HTMLInputElement>(null);
  const weightType = getWeightInputType(equipmentType, weightTypeFromRef);
  const formula = WEIGHT_FORMULAS[weightType];
  const effectiveWeight = calcEffectiveWeight(set.weight || '', weightType, undefined, baseWeight, weightMultiplier, bodyWeightFactor);
  const displayWeight = set.completed ? (set.effectiveWeight ?? (parseFloat(set.weight) || 0)) : (effectiveWeight ?? (parseFloat(set.weight) || 0));
  const show1rm = allows1rm(weightType);
  const oneRM = show1rm && displayWeight && set.reps ? Math.round(displayWeight * (1 + parseInt(set.reps) / 30)) : 0;
  const isAssisted = weightType === 'assisted';
  const asi = isAssisted && displayWeight && displayWeight > 0 ? (displayWeight / BODY_WEIGHT_DEFAULT).toFixed(2) : null;
  const delta = set.prevWeight ? (displayWeight - set.prevWeight) : 0;
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '0';
  const deltaColor = delta > 0 ? 'text-green-500' : delta < 0 ? 'text-red-500' : 'text-zinc-500';
  const isCompleted = set.completed;
  const isEditing = set.isEditing;
  const inputDisabledClass = isCompleted && !isEditing ? 'opacity-50 pointer-events-none' : '';
  const showTotalBadge = effectiveWeight !== null && effectiveWeight !== parseFloat(set.weight || '0');
  const currentSetType = set.setType || 'working';
  const rirVal = set.rir !== undefined && set.rir !== '' ? Number(set.rir) : undefined;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-[48px_1fr_1fr_1fr_48px] gap-1.5 items-center mb-3">
      <button onClick={() => onComplete(set.id)} className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isCompleted ? 'bg-yellow-500 border-yellow-500' : 'bg-transparent border-zinc-700 hover:border-zinc-500'}`}>
        {isCompleted && <Check className="w-6 h-6 text-black stroke-[3]" />}
      </button>
      <input
        type="number"
        inputMode="decimal"
        pattern="[0-9.]*"
        min="0"
        step="0.5"
        placeholder={formula.placeholder}
        value={set.weight}
        onChange={e => {
          const v = e.target.value;
          if (v === '') { onUpdate(set.id, 'weight', v); return; }
          const num = parseFloat(v);
          if (!isNaN(num) && num >= 0) onUpdate(set.id, 'weight', v);
        }}
        onBlur={() => { if (set.weight && repsRef.current) repsRef.current.focus(); }}
        onFocus={e => e.target.select()}
        className={`min-w-0 min-h-[48px] bg-zinc-800 rounded-xl px-2 text-center text-xl font-bold text-zinc-100 focus:ring-1 focus:ring-blue-500 outline-none tabular-nums ${inputDisabledClass}`}
      />
      <input
        ref={repsRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="0"
        value={set.reps}
        onChange={e => onUpdate(set.id, 'reps', e.target.value)}
        onFocus={e => e.target.select()}
        className={`min-w-0 min-h-[48px] bg-zinc-800 rounded-xl px-2 text-center text-xl font-bold text-zinc-100 focus:ring-1 focus:ring-blue-500 outline-none tabular-nums ${inputDisabledClass}`}
      />
      <input
        type="number"
        inputMode="decimal"
        pattern="[0-9.]*"
        placeholder="0"
        value={set.rest}
        onChange={e => onUpdate(set.id, 'rest', e.target.value)}
        onFocus={e => e.target.select()}
        className={`min-w-0 min-h-[48px] bg-zinc-800 rounded-xl px-2 text-center text-zinc-400 focus:text-zinc-100 focus:ring-1 focus:ring-blue-500 outline-none tabular-nums ${inputDisabledClass}`}
      />
      {isCompleted ? (
        <button onClick={() => onToggleEdit(set.id)} className={`w-12 h-12 flex items-center justify-center transition-colors ${isEditing ? 'text-yellow-500' : 'text-zinc-600 hover:text-zinc-400'}`}>
          <Pencil className="w-5 h-5" />
        </button>
      ) : (
        <button onClick={() => onDelete(set.id)} className="w-12 h-12 flex items-center justify-center text-zinc-600 hover:text-red-500">
          <Trash2 className="w-5 h-5" />
        </button>
      )}
      <div className="col-span-5 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[10px]">
        {showTotalBadge && effectiveWeight !== null && effectiveWeight >= 0 && (
          <span className="text-blue-400 font-medium">Итого: {effectiveWeight} кг</span>
        )}
        {show1rm && oneRM > 0 && (
          <span className="text-zinc-500">1PM: {oneRM}{rirVal !== undefined && rirVal >= 0 ? ` RIR${rirVal}` : ''}</span>
        )}
        {!show1rm && (weightType === 'assisted' || weightType === 'bodyweight') && (
          <span className="text-zinc-600 text-[9px]">1RM не рассчитывается</span>
        )}
        {asi !== null && <span className="text-zinc-500">ASI: {asi}</span>}
        {set.prevWeight !== undefined && displayWeight > 0 && <span className={`${deltaColor} font-medium`}>{deltaText}</span>}
        <button
          type="button"
          onClick={() => {
            const idx = SET_TYPE_ORDER.indexOf(currentSetType as SetType);
            const next = SET_TYPE_ORDER[(idx + 1) % 4];
            onUpdate(set.id, 'setType', next);
          }}
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${currentSetType === 'warmup' ? 'bg-zinc-600 text-zinc-300' : currentSetType === 'working' ? 'bg-blue-600/50 text-blue-300' : currentSetType === 'drop' ? 'bg-orange-600/50 text-orange-300' : 'bg-red-600/50 text-red-300'}`}
        >
          {SET_TYPE_LABEL[currentSetType]}
        </button>
        <div className="flex gap-0.5">
          {[0, 1, 2, 3].map(r => (
            <button key={r} type="button" onClick={() => onUpdate(set.id, 'rir', r)} className={`px-1.5 py-0.5 rounded text-[9px] ${rirVal === r ? 'bg-zinc-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}>{r === 3 ? '3+' : r}</button>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
