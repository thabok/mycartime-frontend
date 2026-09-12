import { useCallback, useEffect, useState } from 'react';
import { checkAssistantAvailability } from '@/lib/assistantApi';

/**
 * Whether the AI Assistant button should be shown at all: checked once per
 * app load (a real, if minimal, request to whichever backend - the
 * Anthropic API or the claude CLI - is configured), rather than on every
 * render, since it's neither free nor instant. Call the returned `refresh`
 * after settings that affect this (API key / CLI path) are saved, so the
 * button updates immediately instead of waiting for the next app load.
 *
 * Fails closed: stays hidden until the backend actually confirms a valid
 * API key or a working CLI, and hides again if the check errors out, since
 * an unusable assistant button is worse than a briefly/occasionally missing
 * one.
 */
export function useAssistantAvailability(): [boolean, () => void] {
  const [available, setAvailable] = useState(false);
  const [checkNonce, setCheckNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    checkAssistantAvailability()
      .then((result) => {
        if (!cancelled) setAvailable(result);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkNonce]);

  const refresh = useCallback(() => setCheckNonce((n) => n + 1), []);

  return [available, refresh];
}
