import { useEffect, useRef, useState } from 'react';
import { Sparkle } from 'lucide-react';
import { cn } from '@/lib/utils';

const CHAR_INTERVAL_MS = 22;
const BUFFER_MS = 1000;

interface StatusIndicatorProps {
  /** The verb/phrase to type out. Empty string resets the indicator. */
  text: string;
  fallback?: string;
}

/**
 * Claude-Code-style status line: a breathing spark icon next to a phrase
 * that is typed out character-by-character with a blinking cursor. Each
 * phrase is held for its typing duration plus a fixed buffer before the
 * next queued phrase starts, so rapid status changes upstream don't cause
 * flicker - only the latest pending phrase is kept.
 */
export function StatusIndicator({ text, fallback = 'Thinking…' }: StatusIndicatorProps) {
  const [displayText, setDisplayText] = useState('');
  const [typing, setTyping] = useState(false);
  const queuedRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const runAnimation = (value: string) => {
      busyRef.current = true;
      setTyping(true);
      let i = 0;
      const step = () => {
        i += 1;
        setDisplayText(value.slice(0, i));
        if (i < value.length) {
          timeoutRef.current = setTimeout(step, CHAR_INTERVAL_MS);
        } else {
          timeoutRef.current = setTimeout(() => {
            busyRef.current = false;
            setTyping(false);
            const queued = queuedRef.current;
            if (queued !== null) {
              queuedRef.current = null;
              runAnimation(queued);
            }
          }, BUFFER_MS);
        }
      };
      step();
    };

    if (!text) {
      queuedRef.current = null;
      busyRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setTyping(false);
      setDisplayText('');
      return;
    }

    if (busyRef.current) {
      queuedRef.current = text;
    } else {
      runAnimation(text);
    }
  }, [text]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Sparkle className="h-4 w-4 text-primary animate-spark flex-shrink-0" />
      <span className="text-muted-foreground">
        {displayText || fallback}
        <span
          className={cn(
            'inline-block w-[2px] h-[1em] align-middle ml-0.5 bg-muted-foreground',
            typing ? 'animate-cursor-blink' : 'opacity-0'
          )}
        />
      </span>
    </div>
  );
}
