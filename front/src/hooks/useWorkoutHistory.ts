import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export const GLOBAL_HISTORY_QUERY_KEY = ['globalHistory'] as const;

export function useWorkoutHistory() {
  const queryClient = useQueryClient();
  const { data: history = [], isLoading: loading } = useQuery({
    queryKey: GLOBAL_HISTORY_QUERY_KEY,
    queryFn: () => api.getGlobalHistory(),
    staleTime: 30_000, // 30 сек — не перезапрашивать при переключении экранов
    retry: 2,
  });
  const refreshHistory = () => queryClient.invalidateQueries({ queryKey: GLOBAL_HISTORY_QUERY_KEY });
  return { history, loading, refreshHistory };
}
