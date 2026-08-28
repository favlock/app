import { QueryClient } from '@tanstack/react-query';
import { CloudAccessError } from './cloudAccess';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !(error instanceof CloudAccessError) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
});
