import React, { useState, useEffect } from 'react';
import { getWeightInputType, WEIGHT_FORMULAS, WEIGHT_TYPES } from '../exerciseConfig';
import { EDIT_EXERCISE_DRAFT_KEY } from '../constants';
import { ImageUploadSlot } from './ImageUploadSlot';
import { Modal, Button, Input } from '../ui';
import { api } from '../api';
import type { Exercise } from '../types';

interface EditExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise | null;
  groups: string[];
  onSave: (id: string, updates: Partial<Exercise>) => void | Promise<void>;
}

export const EditExerciseModal = ({ isOpen, onClose, exercise, groups, onSave }: EditExerciseModalProps) => {
    const [name, setName] = useState('');
    const [group, setGroup] = useState('');
    const [secondaryMuscles, setSecondaryMuscles] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState('');
    const [image2, setImage2] = useState('');
    const [equipmentType, setEquipmentType] = useState<string>('barbell');
    const [exerciseType, setExerciseType] = useState<string>('compound');
    const [weightType, setWeightType] = useState<string>('Dumbbell');
    const [baseWeight, setBaseWeight] = useState(0);
    const [weightMultiplier, setWeightMultiplier] = useState(1);
    const [bodyWeightFactor, setBodyWeightFactor] = useState(1);
    const [testInput, setTestInput] = useState('10');
    const [testBodyWt, setTestBodyWt] = useState(90);

    useEffect(() => {
        if (exercise && isOpen) {
            const draft = {
                exerciseId: exercise.id,
                name, group, secondaryMuscles, description, image, image2,
                equipmentType, exerciseType, weightType, baseWeight, weightMultiplier, bodyWeightFactor
            };
            localStorage.setItem(EDIT_EXERCISE_DRAFT_KEY, JSON.stringify(draft));
        }
    }, [name, group, secondaryMuscles, description, image, image2, equipmentType, exerciseType, weightType, baseWeight, weightMultiplier, bodyWeightFactor, exercise, isOpen]);

    useEffect(() => {
        if(exercise && isOpen) {
            const saved = localStorage.getItem(EDIT_EXERCISE_DRAFT_KEY);
            if (saved) {
                try {
                    const draft = JSON.parse(saved);
                    if (draft.exerciseId === exercise.id) {
                        setName(draft.name || exercise.name);
                        setGroup(draft.group || exercise.muscleGroup);
                        setSecondaryMuscles(draft.secondaryMuscles ?? exercise.secondaryMuscles ?? '');
                        setDescription(draft.description || exercise.description || '');
                        setImage(draft.image || exercise.imageUrl || '');
                        setImage2(draft.image2 || exercise.imageUrl2 || '');
                        setEquipmentType(draft.equipmentType ?? exercise.equipmentType ?? 'barbell');
                        setExerciseType(draft.exerciseType ?? exercise.exerciseType ?? 'compound');
                        setWeightType(draft.weightType ?? exercise.weightType ?? 'Dumbbell');
                        setBaseWeight(draft.baseWeight ?? exercise.baseWeight ?? 0);
                        setWeightMultiplier(draft.weightMultiplier ?? exercise.weightMultiplier ?? 1);
                        setBodyWeightFactor(draft.bodyWeightFactor ?? exercise.bodyWeightFactor ?? 1);
                        return;
                    }
                } catch {
                    // Ignore draft parse error
                }
            }
            setName(exercise.name);
            setGroup(exercise.muscleGroup);
            setSecondaryMuscles(exercise.secondaryMuscles || '');
            setDescription(exercise.description || '');
            setImage(exercise.imageUrl || '');
            setImage2(exercise.imageUrl2 || '');
            setEquipmentType(exercise.equipmentType || 'barbell');
            setExerciseType(exercise.exerciseType || 'compound');
            setWeightType(exercise.weightType || 'Dumbbell');
            setBaseWeight(exercise.baseWeight ?? 0);
            setWeightMultiplier(exercise.weightMultiplier ?? 1);
            setBodyWeightFactor(exercise.bodyWeightFactor ?? 1);
        }
    }, [exercise, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            localStorage.removeItem(EDIT_EXERCISE_DRAFT_KEY);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !exercise) return;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                const draft = { exerciseId: exercise.id, name, group, secondaryMuscles, description, image, image2, weightType, baseWeight, weightMultiplier, bodyWeightFactor };
                localStorage.setItem(EDIT_EXERCISE_DRAFT_KEY, JSON.stringify(draft));
            } else {
                const saved = localStorage.getItem(EDIT_EXERCISE_DRAFT_KEY);
                if (saved) {
                    try {
                        const draft = JSON.parse(saved);
                        if (draft.exerciseId === exercise.id) {
                            setName(draft.name || exercise.name);
                            setGroup(draft.group || exercise.muscleGroup);
                            setSecondaryMuscles(draft.secondaryMuscles ?? exercise.secondaryMuscles ?? '');
                            setDescription(draft.description || exercise.description || '');
                            setImage(draft.image || exercise.imageUrl || '');
                            setImage2(draft.image2 || exercise.imageUrl2 || '');
                            setEquipmentType(draft.equipmentType ?? exercise.equipmentType ?? 'barbell');
                            setExerciseType(draft.exerciseType ?? exercise.exerciseType ?? 'compound');
                            setWeightType(draft.weightType ?? exercise.weightType ?? 'Dumbbell');
                            setBaseWeight(draft.baseWeight ?? exercise.baseWeight ?? 0);
                            setWeightMultiplier(draft.weightMultiplier ?? exercise.weightMultiplier ?? 1);
                            setBodyWeightFactor(draft.bodyWeightFactor ?? exercise.bodyWeightFactor ?? 1);
                        }
                    } catch {
                        // Ignore
                    }
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isOpen, exercise, name, group, secondaryMuscles, description, image, image2, equipmentType, exerciseType, weightType, baseWeight, weightMultiplier, bodyWeightFactor]);

    const [uploadingImage1, setUploadingImage1] = useState(false);
    const [uploadingImage2, setUploadingImage2] = useState(false);

    const saveDraft = () => {
        if (exercise) {
            const draft = { exerciseId: exercise.id, name, group, secondaryMuscles, description, image, image2, weightType, baseWeight, weightMultiplier, bodyWeightFactor };
            localStorage.setItem(EDIT_EXERCISE_DRAFT_KEY, JSON.stringify(draft));
        }
    };

    const handleUpload = async (file: File, slot: 1 | 2): Promise<string | null> => {
        slot === 1 ? setUploadingImage1(true) : setUploadingImage2(true);
        try {
            const result = await api.uploadImage(file);
            return result?.url ?? null;
        } finally {
            slot === 1 ? setUploadingImage1(false) : setUploadingImage2(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Редактировать">
            <div className="space-y-6">
                <ImageUploadSlot
                    value={image}
                    onChange={setImage}
                    onUpload={(f: File) => handleUpload(f, 1)}
                    uploading={uploadingImage1}
                    label="Основное фото"
                    inputId="edit-exercise-image-1"
                    onBeforeOpen={saveDraft}
                />
                <ImageUploadSlot
                    value={image2}
                    onChange={setImage2}
                    onUpload={(f: File) => handleUpload(f, 2)}
                    uploading={uploadingImage2}
                    label="Дополнительное фото"
                    inputId="edit-exercise-image-2"
                    onBeforeOpen={saveDraft}
                />
                <div><label className="text-sm text-zinc-400 mb-1 block">Название</label><Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} /></div>

                <div>
                    <label className="text-sm text-zinc-400 mb-1 block">Описание</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-zinc-900 text-zinc-50 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-zinc-600 placeholder:text-zinc-600 transition-all min-h-[100px] resize-none"
                        placeholder="Добавьте описание..."
                    />
                </div>

                <div>
                    <label className="text-sm text-zinc-400 mb-1 block">Группа</label>
                    <div className="flex flex-wrap gap-2">{groups.map((g: string) => <button key={g} onClick={() => setGroup(g)} className={`px-3 py-2 rounded-xl text-sm border ${group === g ? 'bg-blue-600 border-blue-600 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>{g}</button>)}</div>
                </div>

                <div><label className="text-sm text-zinc-400 mb-1 block">Вспомогательные мышцы</label><Input value={secondaryMuscles} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecondaryMuscles(e.target.value)} placeholder="Например: Трицепс, Плечи" /></div>

                <div className="pt-4 border-t border-zinc-800">
                    <label className="text-sm text-zinc-400 mb-2 block">Параметры</label>
                    <div className="space-y-3">
                        <div>
                            <span className="text-xs text-zinc-500 block mb-1">Оборудование</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'] as const).map(t => (
                                    <button key={t} type="button" onClick={() => setEquipmentType(t)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${equipmentType === t ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                                        {{barbell: 'Штанга', dumbbell: 'Гантели', machine: 'Тренажёр', cable: 'Блок', bodyweight: 'Своё тело', other: 'Другое'}[t]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className="text-xs text-zinc-500 block mb-1">Тип упражнения</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(['compound', 'isolation', 'cardio'] as const).map(t => (
                                    <button key={t} type="button" onClick={() => setExerciseType(t)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${exerciseType === t ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                                        {{compound: 'Базовое', isolation: 'Изолирующее', cardio: 'Кардио'}[t]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className="text-xs text-zinc-500 block mb-1">Расчёт веса</span>
                            <select value={weightType} onChange={e => setWeightType(e.target.value)} className="w-full h-10 bg-zinc-800 rounded-xl px-3 text-zinc-100 text-sm focus:ring-1 focus:ring-blue-500 outline-none">
                                {WEIGHT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500 w-24">База, кг</span>
                            <button type="button" onClick={() => setBaseWeight(Math.max(0, baseWeight - 2.5))} className="w-10 h-10 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700">−</button>
                            <span className="flex-1 text-center font-bold text-zinc-100 tabular-nums">{baseWeight}</span>
                            <button type="button" onClick={() => setBaseWeight(baseWeight + 2.5)} className="w-10 h-10 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700">+</button>
                        </div>
                        <div className="flex gap-2">
                            <span className="text-xs text-zinc-500 self-center">Multiplier</span>
                            <button type="button" onClick={() => setWeightMultiplier(1)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${weightMultiplier === 1 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>1</button>
                            <button type="button" onClick={() => setWeightMultiplier(2)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${weightMultiplier === 2 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>2</button>
                        </div>
                        {weightType === 'Bodyweight' && (
                            <div>
                                <span className="text-xs text-zinc-500 block mb-1">Биомеханический коэффициент (0.68 — отжимания)</span>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setBodyWeightFactor(1)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${bodyWeightFactor === 1 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>1.0</button>
                                    <button type="button" onClick={() => setBodyWeightFactor(0.68)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${bodyWeightFactor === 0.68 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>0.68</button>
                                </div>
                            </div>
                        )}
                        <div className="pt-2 border-t border-zinc-800/50">
                            <span className="text-xs text-zinc-500 block mb-1">Проверка</span>
                            <div className="flex gap-2 items-center flex-wrap">
                                <input type="number" value={testInput} onChange={e => setTestInput(e.target.value)} placeholder="Input" className="w-16 h-8 bg-zinc-800 rounded px-2 text-zinc-100 text-sm" />
                                {(weightType === 'Assisted' || weightType === 'Bodyweight') && (
                                    <input type="number" value={testBodyWt} onChange={e => setTestBodyWt(Number(e.target.value) || 90)} className="w-16 h-8 bg-zinc-800 rounded px-2 text-zinc-100 text-sm" />
                                )}
                                {(() => {
                                    const wt = getWeightInputType(undefined, weightType);
                                    const f = WEIGHT_FORMULAS[wt];
                                    const bwFactor = wt === 'bodyweight' ? bodyWeightFactor : undefined;
                                    const eff = !isNaN(parseFloat(testInput) || 0) ? f.toEffective(parseFloat(testInput) || 0, testBodyWt, baseWeight, weightMultiplier, bwFactor) : null;
                                    return eff !== null ? <span className="text-blue-400 text-sm">→ {eff} кг</span> : null;
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                <Button
                    onClick={async () => {
                        if (!exercise) return;
                        localStorage.removeItem(EDIT_EXERCISE_DRAFT_KEY);
                        await onSave(exercise.id, { name, muscleGroup: group, secondaryMuscles, description, imageUrl: image, imageUrl2: image2, equipmentType, exerciseType, weightType, baseWeight, weightMultiplier, bodyWeightFactor });
                        onClose();
                    }}
                    className="w-full h-12"
                    disabled={uploadingImage1 || uploadingImage2}
                >
                    {uploadingImage1 || uploadingImage2 ? 'Загрузка...' : 'Сохранить'}
                </Button>
            </div>
        </Modal>
    );
};
