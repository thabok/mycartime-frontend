import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Priority order the solver actually optimizes for (backend/src/solver_service.py
 * _add_objective(), weights in backend/src/config.py SOLVER_OBJECTIVE_WEIGHTS).
 * Simplified from the raw weight order for the user: the overflow and
 * overflow3/2/1 tiers are merged into one "avoid exceeding the target drive
 * count" item, #1/#2 are swapped, and it's worded as "avoid" rather than
 * "never" - some schedules are simply incompatible enough that a member must
 * exceed their target. The week A/B items only apply with alternating weeks.
 * The "create parties for under-used drivers" item is a hard constraint
 * (backend/src/config.py CREATE_PARTIES_FOR_UNDERUSED_DRIVERS, enforced in
 * solver_service.py before the objective is built) rather than a weighted
 * objective term, but it only bites when the setting is on.
 */
const SOLVER_PRIORITIES = [
  { text: 'Respect "skip driving" preferences (no car)', abOnly: false, requiresCreatePartiesForUnderusedDrivers: false },
  { text: 'Avoid exceeding a member’s target drive count', abOnly: false, requiresCreatePartiesForUnderusedDrivers: false },
  { text: 'Create extra parties so under-used drivers reach their target drive count (fairness)', abOnly: false, requiresCreatePartiesForUnderusedDrivers: true },
  { text: 'Drive the same weekday in both week A and B', abOnly: true, requiresCreatePartiesForUnderusedDrivers: false },
  { text: 'Balance drive counts between week A and B', abOnly: true, requiresCreatePartiesForUnderusedDrivers: false },
];

/**
 * Priority order applied after the solver, when placing passengers into the
 * parties it already created (backend/src/plan_postprocessor.py
 * optimize_passenger_placement()). Never changes who drives.
 */
const POST_PROCESSING_PRIORITIES = [
  { text: 'Match each passenger with the closest departure/arrival time', abOnly: false },
  { text: 'Keep the same driver for a passenger in week A and B', abOnly: true },
  { text: 'Spread passengers evenly across same-time parties', abOnly: false },
];

export function OptimizationPriorities({
  alternatingWeeks = true,
  createPartiesForUnderusedDrivers = true,
}: {
  alternatingWeeks?: boolean;
  createPartiesForUnderusedDrivers?: boolean;
}) {
  const applies = (item: { abOnly: boolean; requiresCreatePartiesForUnderusedDrivers?: boolean }) =>
    (alternatingWeeks || !item.abOnly) &&
    (createPartiesForUnderusedDrivers || !item.requiresCreatePartiesForUnderusedDrivers);
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
              {SOLVER_PRIORITIES.filter(applies).map((item) => (
                <li key={item.text}>{item.text}</li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Passenger placement</h4>
            <p className="text-xs text-muted-foreground mb-1">
              Once who drives is fixed, passengers are assigned to a party in order of:
            </p>
            <ol className="list-decimal pl-4 space-y-0.5">
              {POST_PROCESSING_PRIORITIES.filter(applies).map((item) => (
                <li key={item.text}>{item.text}</li>
              ))}
            </ol>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
