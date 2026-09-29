import { useLocalStorage } from '@/hooks/useLocalStorage';

// Client-side mirror of the backend's ALTERNATING_WEEKS setting, refreshed
// from /api/v1/settings on app load and on every save in the Settings dialog,
// so components that only need this one flag don't each have to fetch it.
export function useAlternatingWeeks() {
  return useLocalStorage<boolean>('carpool-alternating-weeks', false);
}
