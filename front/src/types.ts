export type Screen = 'home' | 'exercises' | 'workout' | 'history' | 'analytics';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  description?: string;
  imageUrl?: string;
  imageUrl2?: string;
  equipmentType?: string;
  weightType?: string;
  baseWeight?: number;
  weightMultiplier?: number;
  /** 1RM методологически некорректен для Assisted/Bodyweight */
  allow_1rm?: boolean;
}

export type SetType = 'warmup' | 'working' | 'drop' | 'failure';

export interface WorkoutSet {
  id: string;
  weight: string;
  reps: string;
  rest: string;
  completed: boolean;
  prevWeight?: number;
  order?: number;
  setGroupId?: string;
  isEditing?: boolean;
  rowNumber?: number;
  pendingId?: string;
  effectiveWeight?: number;
  setType?: SetType;
  rpe?: number | string;
  rir?: number | string;
  isLowConfidence?: boolean;
}

export interface HistoryItem {
  date: string;
  weight: number;
  reps: number;
  rest: number;
  order?: number;
  setGroupId?: string | null;
}

export interface ExerciseSessionData {
  exercise: Exercise;
  note: string;
  sets: WorkoutSet[];
  history: HistoryItem[];
}

export interface GlobalWorkoutSession {
  id: string;
  date: string;
  muscleGroups: string[];
  duration: string;
  exercises: { name: string; sets: any[]; supersetId?: string }[];
}

export interface AnalyticsDataV4 {
  mode: 'Вкат' | 'Поддержание' | 'Стабильный';
  frequencyScore: { value: number; status: string; actual: number; target: number };
  maxGap: { value: number; status: string; interpretation: string };
  returnToBaseline: { value: number; visible: boolean } | null;
  stabilityGate: boolean;
  baselines: { exerciseId: string; name: string; baseline: number | null; status: string }[];
  proposals: { exerciseId: string; oldBaseline: number; newBaseline: number; step: number; expiresAt: string; proposalId: string }[];
  meta: { period: number };
}
