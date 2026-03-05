import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { GLOBAL_HISTORY_QUERY_KEY } from './useWorkoutHistory';

export interface UpdateSetParams {
  row_number: string;
  exercise_id: string;
  set_group_id: string;
  order: number;
  weight: number;
  reps: number;
  rest: number;
  updated_at?: string;
}

export function useLogSet() {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (params: UpdateSetParams) => {
      const res = await api.updateSet({
        ...params,
        input_weight: params.weight,
      });
      return res;
    },
    onSuccess: (res: { status?: string } | null) => {
      if (res?.status === 'success') {
        queryClient.invalidateQueries({ queryKey: GLOBAL_HISTORY_QUERY_KEY });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (rowNumber: string) => api.deleteSet(rowNumber),
    onSuccess: (res: { status?: string } | null) => {
      if (res?.status === 'success') {
        queryClient.invalidateQueries({ queryKey: GLOBAL_HISTORY_QUERY_KEY });
      }
    },
  });

  return {
    updateSet: async (params: UpdateSetParams) => {
      const res = await updateMutation.mutateAsync(params);
      return res;
    },
    deleteSet: async (rowNumber: string) => {
      const res = await deleteMutation.mutateAsync(rowNumber);
      return res;
    },
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
