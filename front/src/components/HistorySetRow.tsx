import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { SetDisplayRow } from './SetDisplayRow';

interface HistorySet {
  id?: string;
  weight: number;
  reps: number;
  rest: number;
  exerciseId?: string;
  setGroupId?: string;
  order?: number;
  set_type?: string;
  rpe?: number;
  rir?: number;
  updated_at?: string;
}

interface HistorySetRowProps {
  set: HistorySet;
  className?: string;
  onSave: (updates: { weight: number; reps: number; rest: number }) => Promise<void>;
  onDelete?: () => void | Promise<void>;
}

export function HistorySetRow({ set, className = '', onSave, onDelete }: HistorySetRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [weight, setWeight] = useState(String(set.weight));
  const [reps, setReps] = useState(String(set.reps));
  const [rest, setRest] = useState(String(set.rest));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const canEdit = !!set.id;

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 1000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const handleSave = async () => {
    if (!saving) {
      setSaving(true);
      try {
        const w = parseFloat(weight) || 0;
        const r = parseInt(reps, 10) || 0;
        const rs = parseFloat(rest) || 0;
        await onSave({ weight: w, reps: r, rest: rs });
        setJustSaved(true);
        if (navigator.vibrate) navigator.vibrate(50);
        setTimeout(() => setIsEditing(false), 1000);
      } catch {
        // ignore
      } finally {
        setSaving(false);
      }
    }
  };

  const repsRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);

  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 p-3 ${className}`}>
        <input
          ref={weightRef}
          type="number"
          inputMode="decimal"
          pattern="[0-9.]*"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => { if (weight && repsRef.current) repsRef.current.focus(); }}
          className="w-16 min-h-[48px] bg-zinc-800 text-zinc-50 rounded-lg px-2 text-center text-sm tabular-nums"
          placeholder="кг"
        />
        <span className="text-zinc-500">×</span>
        <input
          ref={repsRef}
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          className="w-14 min-h-[48px] bg-zinc-800 text-zinc-50 rounded-lg px-2 text-center text-sm tabular-nums"
          placeholder="повт"
        />
        <span className="text-zinc-500 text-sm">отдых</span>
        <input
          type="number"
          inputMode="decimal"
          pattern="[0-9.]*"
          value={rest}
          onChange={(e) => setRest(e.target.value)}
          className="w-12 min-h-[48px] bg-zinc-800 text-zinc-50 rounded-lg px-2 text-center text-sm tabular-nums"
          placeholder="м"
        />
        <motion.button
          onClick={handleSave}
          disabled={saving}
          whileTap={{ scale: 0.95 }}
          className="ml-auto min-w-[48px] min-h-[48px] flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
        >
          <Check className={`w-5 h-5 transition-colors ${justSaved ? 'text-green-400' : ''}`} />
        </motion.button>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!onDelete || deleting) return;
    if (!confirm('Удалить подход?')) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`flex items-center ${className}`}>
      <div className="flex-1 min-w-0">
        <SetDisplayRow weight={set.weight} reps={set.reps} rest={set.rest} setType={set.set_type} rpe={set.rpe} rir={set.rir} />
      </div>
      {canEdit && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
            title="Редактировать"
          >
            <Pencil className="w-5 h-5" />
          </button>
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
              title="Удалить"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
