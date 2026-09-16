import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Priority order the solver actually optimizes for (backend/src/solver_service.py
 * _add_objective(), weights in backend/src/config.py SOLVER_OBJECTIVE_WEIGHTS).
 * Simplified from the raw weight order for the user: the max-drives and
 * over-4/5/6 tiers are merged into one "avoid exceeding max drives" item, #1/#2
 * are swapped, and it's worded as "avoid" rather than "never" - some schedules
 * are simply incompatible enough that a member must exceed their max drives.
 */
const SOLVER_PRIORITIES = [
  'Respect "skip driving" preferences (no car)',
  'Avoid exceeding a member’s max drives',
  'Drive the same weekday in both week A and B',
  'Balance drive counts between week A and B',
];

/**
 * Priority order applied after the solver, when placing passengers into the
 * parties it already created (backend/src/plan_postprocessor.py
 * optimize_passenger_placement()). Never changes who drives.
 */
const POST_PROCESSING_PRIORITIES = [
  'Match each passenger with the closest departure/arrival time',
  'Keep the same driver for a passenger in week A and B',
  'Spread passengers evenly across same-time parties (tie-break only)',
];

export function OptimizationPriorities() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
          What is this plan optimized for?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 text-sm" align="start">
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold mb-1">Solver priorities</h4>
            <p className="text-xs text-muted-foreground mb-1">
              Who drives, in order of importance (each rule only gives way when honoring it is impossible):
            </p>
            <ol className="list-decimal pl-4 space-y-0.5">
              {SOLVER_PRIORITIES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Passenger placement</h4>
            <p className="text-xs text-muted-foreground mb-1">
              Once who drives is fixed, passengers are assigned to a party in order of:
            </p>
            <ol className="list-decimal pl-4 space-y-0.5">
              {POST_PROCESSING_PRIORITIES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
