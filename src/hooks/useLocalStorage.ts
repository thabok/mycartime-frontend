import { useState, useEffect, useCallback } from 'react';

// Same-tab equivalent of the browser's cross-tab "storage" event: without
// this, two components reading the same key (e.g. the WebUntis credential
// fields on both the Settings dialog and the driving-plan page) each hold
// their own React state that only reads localStorage once, at mount, so a
// change in one never appears in the other until a remount.
const LOCAL_STORAGE_EVENT = 'local-storage-change';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    const handleChange = (event: Event) => {
      const { key: changedKey, value } = (event as CustomEvent<{ key: string; value: T }>).detail;
      if (changedKey === key) setStoredValue(value);
    };
    window.addEventListener(LOCAL_STORAGE_EVENT, handleChange);
    return () => window.removeEventListener(LOCAL_STORAGE_EVENT, handleChange);
  }, [key]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
      window.dispatchEvent(new CustomEvent(LOCAL_STORAGE_EVENT, { detail: { key, value: valueToStore } }));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
}
