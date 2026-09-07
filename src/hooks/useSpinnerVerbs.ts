import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whimsical status phrases shown while something slow is happening, shared by
 * the AI assistant and plan generation so both feel like the same product.
 * The list lives on the backend (assistant/harry-potter-spinning-verbs.txt).
 */
export function useSpinnerVerbs() {
  const verbsRef = useRef<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const backendHostAndPort = `http://${window.location.hostname}:1338`;
    fetch(`${backendHostAndPort}/api/v1/assistant/spinner-verbs`)
      .then(res => (res.ok ? res.json() : []))
      .then((verbs: string[]) => {
        verbsRef.current = verbs;
      })
      .catch(() => {});
  }, []);

  const pickStatusMessage = useCallback(() => {
    const verbs = verbsRef.current;
    if (verbs.length === 0) return;
    setStatusMessage(verbs[Math.floor(Math.random() * verbs.length)]);
  }, []);

  return { statusMessage, setStatusMessage, pickStatusMessage };
}
