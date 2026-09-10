import { useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'dark' | 'light';

const STORAGE_KEY = 'carpool-theme-preference';

function getSystemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  } catch {
    // ignore
  }
  return 'system';
}

/**
 * Theme preference hook.
 *
 * - Defaults to following the OS theme (`system`).
 * - When the user explicitly chooses dark or light, that choice is persisted
 *   and no longer follows OS changes.
 * - While in `system` mode, reacts live to OS theme changes.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  // Track OS theme changes only when following the system.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const isDark = preference === 'system' ? systemDark : preference === 'dark';

  // Apply the theme class to <html>.
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const setThemePreference = (next: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setPreference(next);
  };

  // Toggle between explicit dark/light. Once toggled, the user has made an
  // explicit choice, so we leave `system` mode and persist it.
  const toggleTheme = () => {
    setThemePreference(isDark ? 'light' : 'dark');
  };

  return { preference, isDark, toggleTheme, setThemePreference };
}
