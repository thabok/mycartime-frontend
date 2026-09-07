import { useEffect, useState } from 'react';
import { Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusIndicator } from '@/components/StatusIndicator';
import { PlanGenerationState, PlanSolutionMetrics } from '@/types/planGeneration';

/** How often a fresh spinning verb is shown, matching the assistant's pacing. */
const VERB_ROTATE_MS = 6000;

interface PlanGenerationDialogProps {
  open: boolean;
  state: PlanGenerationState;
  /** Current spinning verb; the dialog asks for a new one on a timer. */
  statusMessage: string;
  onRequestNewVerb: () => void;
  onStop: () => void;
}

const formatElapsed = (seconds: number) => {
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
};

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: PlanSolutionMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Metric label="Total drives" value={metrics.totalDrives} hint="lower is better" />
      <Metric label="Cars on the road" value={metrics.driverLegs} />
      <Metric label="Busiest member" value={`${metrics.maxDrives} days`} />
      <Metric
        label="Over their limit"
        value={metrics.numOverMaxDrives}
        hint={`${metrics.numDrivingMoreThan4} drive >4×`}
      />
    </div>
  );
}

/**
 * Progress dialog for plan generation. The CP-SAT engine usually finds its best
 * plan within seconds but needs minutes to *prove* nothing better exists, so
 * this shows the metrics of the current best plan and offers a Stop button that
 * settles for it. Deliberately not dismissible by Esc / clicking outside: the
 * only ways out are letting it finish or pressing Stop, both of which produce a
 * plan.
 */
export function PlanGenerationDialog({
  open,
  state,
  statusMessage,
  onRequestNewVerb,
  onStop,
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

  const { metrics, phaseMessage, stopping } = state;

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

        <StatusIndicator text={statusMessage} fallback="Working…" />

        {metrics ? (
          <div className="space-y-2">
            <MetricsGrid metrics={metrics} />
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

        <div className="flex justify-end">
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
