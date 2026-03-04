import { useState } from 'react';
import { Pencil, Check, Trash2 } from 'lucide-react';
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
}

interface HistorySetRowProps {
  set: HistorySet;
  className?: string;
  onSave: (updates: { weight: number; reps: number; rest: number }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function HistorySetRow({ set, className = '', onSave, onDelete }: HistorySetRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [weight, setWeight] = useState(String(set.weight));
  const [reps, setReps] = useState(String(set.reps));
  const [rest, setRest] = useState(String(set.rest));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = !!set.id;

  const handleSave = async () => {
    if (!saving) {
      setSaving(true);
      try {
        const w = parseFloat(weight) || 0;
        const r = parseInt(reps, 10) || 0;
        const rs = parseFloat(rest) || 0;
        await onSave({ weight: w, reps: r, rest: rs });
        setIsEditing(false);
      } catch {
        // ignore
      } finally {
        setSaving(false);
      }
    }
  };

  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 p-3 ${className}`}>
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="w-16 h-10 bg-zinc-800 text-zinc-50 rounded-lg px-2 text-center text-sm"
          placeholder="кг"
        />
        <span className="text-zinc-500">×</span>
        <input
          type="number"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          className="w-14 h-10 bg-zinc-800 text-zinc-50 rounded-lg px-2 text-center text-sm"
          placeholder="повт"
        />
        <span className="text-zinc-500 text-sm">отдых</span>
        <input
          type="number"
          value={rest}
          onChange={(e) => setRest(e.target.value)}
          className="w-12 h-10 bg-zinc-800 text-zinc-50 rounded-lg px-2 text-center text-sm"
          placeholder="м"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
        >
          <Check className="w-5 h-5" />
        </button>
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
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
            title="Редактировать"
          >
            <Pencil className="w-5 h-5" />
          </button>
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
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
