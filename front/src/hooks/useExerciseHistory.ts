import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useExerciseHistory(exerciseId: string | null) {
  const { data, isLoading: loading } = useQuery({
    queryKey: ['history', exerciseId],
    queryFn: () => api.getHistory(exerciseId!),
    enabled: !!exerciseId,
  });
  return {
    history: data?.history ?? [],
    note: data?.note ?? '',
    loading,
  };
}
