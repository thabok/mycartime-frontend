import { useEffect, useState } from 'react';
import { checkAssistantAvailability } from '@/lib/assistantApi';

/**
 * Whether the AI Assistant button should be shown at all: checked once per
 * app load (a real, if minimal, request to whichever backend - the
 * Anthropic API or the claude CLI - is configured), rather than on every
 * render, since it's neither free nor instant.
 */
export function useAssistantAvailability(): boolean {
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    checkAssistantAvailability()
      .then((result) => {
        if (!cancelled) setAvailable(result);
      })
      .catch(() => {
        // Best-effort: keep showing the button rather than hiding it on a
        // transient backend/network hiccup.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
