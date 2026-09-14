import { useState, useEffect, useCallback } from 'react';

// See useLocalStorage's LOCAL_STORAGE_EVENT for why this same-tab sync is
// needed: it keeps every component reading the same key (e.g. the WebUntis
// password field on both the Settings dialog and the driving-plan page) in
// sync with each other, not just with sessionStorage itself.
const SESSION_STORAGE_EVENT = 'session-storage-change';

export function useSessionStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading sessionStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    const handleChange = (event: Event) => {
      const { key: changedKey, value } = (event as CustomEvent<{ key: string; value: T }>).detail;
      if (changedKey === key) setStoredValue(value);
    };
    window.addEventListener(SESSION_STORAGE_EVENT, handleChange);
    return () => window.removeEventListener(SESSION_STORAGE_EVENT, handleChange);
  }, [key]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
      window.dispatchEvent(new CustomEvent(SESSION_STORAGE_EVENT, { detail: { key, value: valueToStore } }));
    } catch (error) {
      console.error(`Error setting sessionStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
}
