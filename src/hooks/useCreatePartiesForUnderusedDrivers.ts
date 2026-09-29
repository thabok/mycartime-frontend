import { useLocalStorage } from '@/hooks/useLocalStorage';

// Client-side mirror of the backend's CREATE_PARTIES_FOR_UNDERUSED_DRIVERS
// setting, refreshed from /api/v1/settings on app load and on every save in
// the Settings dialog, so components that only need this one flag don't each
// have to fetch it.
export function useCreatePartiesForUnderusedDrivers() {
  return useLocalStorage<boolean>('carpool-create-parties-for-underused-drivers', true);
}
