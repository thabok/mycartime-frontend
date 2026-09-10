import { useEffect, useRef, useState } from 'react';
import { Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { StatusIndicator } from '@/components/StatusIndicator';
import { Metric, MetricsGrid } from '@/components/MetricCard';
import { PlanGenerationState, PlanSolutionMetrics } from '@/types/planGeneration';

/** How often a fresh spinning verb is shown, matching the assistant's pacing. */
const VERB_ROTATE_MS = 6000;

/** Frequent enough that the countdown bar drains smoothly rather than ticking. */
const COUNTDOWN_TICK_MS = 100;

/**
 * How long the bar takes to glide back to full after an improvement resets it.
 * Every improving solution restarts the countdown, which happens often, so the
 * refill gets an eased glide instead of the snap a drain-paced transition gives.
 */
const COUNTDOWN_REFILL_MS = 600;

interface PlanGenerationDialogProps {
  open: boolean;
  state: PlanGenerationState;
  /** Current spinning verb; the dialog asks for a new one on a timer. */
  statusMessage: string;
  onRequestNewVerb: () => void;
  onStop: () => void;
  /** Whether to stop by itself once the search stops improving. */
  autoStopEnabled: boolean;
  onAutoStopEnabledChange: (enabled: boolean) => void;
}

const formatSeconds = (seconds: number) =>
  `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;

const formatElapsed = (seconds: number) => {
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
};

function SolverMetricsGrid({ metrics }: { metrics: PlanSolutionMetrics }) {
  return (
    <MetricsGrid>
      <Metric
        label="Over their limit"
        value={metrics.numOverMaxDrives}
        hint={`${metrics.numDrivingMoreThan4} drive >4×`}
      />
      <Metric label="Busiest member" value={`${metrics.maxDrives} days`} />
      <Metric
        label="Differing weekdays A/B"
        value={metrics.weekABMismatches}
        hint="lower is better"
      />
      <Metric label="Total drives" value={metrics.totalDrives} />
    </MetricsGrid>
  );
}

/**
 * Progress dialog for plan generation. The CP-SAT engine usually finds its best
 * plan within seconds but needs minutes to *prove* nothing better exists, so
 * this shows the metrics of the current best plan and offers a Stop button that
 * settles for it. Deliberately not dismissible by Esc / clicking outside: every
 * way out of this dialog produces a plan.
 *
 * The auto-stop lives here rather than on the server so that the countdown is
 * driven by the same clock that displays it, and so unticking the box takes
 * effect immediately instead of racing a timer already running server-side.
 */
export function PlanGenerationDialog({
  open,
  state,
  statusMessage,
  onRequestNewVerb,
  onStop,
  autoStopEnabled,
  onAutoStopEnabledChange,
}: PlanGenerationDialogProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!open) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 1000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(onRequestNewVerb, VERB_ROTATE_MS);
    return () => clearInterval(timer);
  }, [open, onRequestNewVerb]);

  const { metrics, phaseMessage, stopping, noImprovementSeconds } = state;
  const solutionCount = metrics?.solutionCount ?? null;

  // Restart the idle clock on every improving solution. Only solutions count:
  // before the first one there is no plan to settle for, so auto-stopping then
  // would abandon the search with nothing to show for it.
  const [lastImprovementAt, setLastImprovementAt] = useState<number | null>(null);
  useEffect(() => {
    setLastImprovementAt(open && solutionCount !== null ? Date.now() : null);
  }, [open, solutionCount]);

  const [idleSeconds, setIdleSeconds] = useState(0);
  useEffect(() => {
    if (lastImprovementAt === null) {
      setIdleSeconds(0);
      return;
    }
    setIdleSeconds(0);
    const timer = setInterval(
      () => setIdleSeconds((Date.now() - lastImprovementAt) / 1000),
      COUNTDOWN_TICK_MS,
    );
    return () => clearInterval(timer);
  }, [lastImprovementAt]);

  const autoStopArmed = autoStopEnabled && noImprovementSeconds !== null && !stopping
    && lastImprovementAt !== null;
  const remainingSeconds = autoStopArmed
    ? Math.max(0, (noImprovementSeconds as number) - idleSeconds)
    : null;

  // Fire once per solve: `stopping` latches on the first call, but that state
  // arrives a render later, so the ref is what actually prevents a double stop.
  const autoStopFired = useRef(false);
  useEffect(() => {
    if (!open) autoStopFired.current = false;
  }, [open]);
  useEffect(() => {
    if (!autoStopArmed || autoStopFired.current) return;
    if (remainingSeconds !== null && remainingSeconds <= 0) {
      autoStopFired.current = true;
      onStop();
    }
  }, [autoStopArmed, remainingSeconds, onStop, open]);

  // The window is held open for the whole glide rather than a single frame: the
  // bar keeps draining while it refills, and CSS retargets an in-flight
  // transition from wherever the bar currently is, so the glide isn't cut short.
  const [refilling, setRefilling] = useState(false);
  useEffect(() => {
    if (lastImprovementAt === null) return;
    setRefilling(true);
    const timer = setTimeout(() => setRefilling(false), COUNTDOWN_REFILL_MS);
    return () => clearTimeout(timer);
  }, [lastImprovementAt]);

  const showCountdown = autoStopArmed && remainingSeconds !== null;

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-xl [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Generating driving plan</DialogTitle>
          <DialogDescription>
            {phaseMessage}
            {' · '}
            {formatElapsed(elapsed)}
          </DialogDescription>
        </DialogHeader>

        <StatusIndicator text={statusMessage} fallback="Waiting for Ron to solve chess…" />

        {metrics ? (
          <div className="space-y-2">
            <SolverMetricsGrid metrics={metrics} />
            <p className="text-xs text-muted-foreground">
              Best plan so far (improvement #{metrics.solutionCount}). The search keeps
              running to confirm no better plan exists — stop any time to keep this one.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No plan found yet — the first results usually appear within a few seconds.
          </p>
        )}

        {showCountdown && (
          <div className="space-y-1" aria-live="polite">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">Stopping unless something improves in</span>
              <span className="font-semibold tabular-nums">
                {(remainingSeconds as number).toFixed(1)}s
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{
                  width: `${((remainingSeconds as number) / (noImprovementSeconds as number)) * 100}%`,
                  transitionDuration: `${refilling ? COUNTDOWN_REFILL_MS : COUNTDOWN_TICK_MS}ms`,
                  transitionTimingFunction: refilling ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'linear',
                }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-stop"
              checked={autoStopEnabled}
              onCheckedChange={(checked) => onAutoStopEnabledChange(checked === true)}
            />
            <Label htmlFor="auto-stop" className="text-xs font-normal text-muted-foreground">
              {noImprovementSeconds === null
                ? 'Auto-stop when no improvements are found'
                : `Auto-stop after ${formatSeconds(noImprovementSeconds)} with no improvements`}
            </Label>
          </div>
          <Button variant="outline" onClick={onStop} disabled={!metrics || stopping}>
            {stopping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wrapping up…
              </>
            ) : (
              <>
                <Square className="mr-2 h-4 w-4" />
                Stop and use this plan
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
