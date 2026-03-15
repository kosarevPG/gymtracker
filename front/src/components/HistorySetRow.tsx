import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Pencil, Trash2, Check } from 'lucide-react';

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
  index: number;
  className?: string;
  onSave: (updates: { weight: number; reps: number; rest: number }) => Promise<void>;
  onDelete?: () => void | Promise<void>;
}

export function HistorySetRow({ set, index, className = '', onSave, onDelete }: HistorySetRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [weight, setWeight] = useState(String(set.weight));
  const [reps, setReps] = useState(String(set.reps));
  const [rest, setRest] = useState(String(set.rest));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const repsRef = useRef<HTMLInputElement>(null);

  const canEdit = !!set.id;
  const isWarmup = set.set_type === 'warmup';

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        weight: parseFloat(weight) || 0,
        reps: parseInt(reps, 10) || 0,
        rest: parseFloat(rest) || 0,
      });
      if (navigator.vibrate) navigator.vibrate(50);
      setTimeout(() => setIsEditing(false), 300);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || deleting) return;
    setMenuOpen(false);
    if (!confirm('Удалить подход?')) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 ${className}`}>
        <span className="tabular-nums text-zinc-500 text-xs w-[2rem] shrink-0">{index + 1}</span>
        <input
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => { if (weight && repsRef.current) repsRef.current.focus(); }}
          className="w-16 min-h-[40px] bg-zinc-800 text-zinc-50 rounded-lg px-2 text-center text-sm tabular-nums"
          placeholder="кг"
          autoFocus
        />
        <span className="text-zinc-500 text-xs">×</span>
        <input
          ref={repsRef}
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          className="w-14 min-h-[40px] bg-zinc-800 text-zinc-50 rounded-lg px-2 text-center text-sm tabular-nums"
          placeholder="повт"
        />
        <input
          type="number"
          inputMode="decimal"
          value={rest}
          onChange={(e) => setRest(e.target.value)}
          className="w-12 min-h-[40px] bg-zinc-800 text-zinc-50 rounded-lg px-2 text-center text-sm tabular-nums"
          placeholder="м"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center px-3 py-1.5 text-sm ${className} ${
        isWarmup ? 'text-zinc-500' : 'text-zinc-300'
      }`}
    >
      {/* # */}
      <span className="tabular-nums text-zinc-500 text-xs">{index + 1}</span>

      {/* Weight */}
      <span className="text-center">
        <span className={`tabular-nums font-bold ${isWarmup ? 'text-zinc-400' : 'text-zinc-100'}`}>
          {set.weight}
        </span>
        <span className="text-zinc-500 text-xs ml-1">кг</span>
      </span>

      {/* Reps */}
      <span className="text-center tabular-nums font-medium">{set.reps}</span>

      {/* Rest */}
      <span className="text-right tabular-nums text-zinc-500 text-xs">
        {Number(set.rest) > 0 ? `${set.rest} м` : '—'}
      </span>

      {/* 3-dot menu */}
      {canEdit ? (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-7 h-7 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]">
              <button
                onClick={() => { setMenuOpen(false); setIsEditing(true); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Изменить
              </button>
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Удалить
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <span />
      )}
    </div>
  );
}
