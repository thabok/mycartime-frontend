import { DrivingPlan } from './carpool';

/**
 * Quality metrics of the best plan the solver has found so far. Mirrors what
 * backend/src/experiments/analyze_plans.py reports for a finished plan, so
 * "better" means the same thing in the UI as it does when comparing captures.
 */
export interface PlanSolutionMetrics {
  /** 1-based index of this solution in the solver's improving-solution sequence. */
  solutionCount: number;
  /** Sum over members of the days they drive. */
  totalDrives: number;
  /** Days driven by the busiest single member. */
  maxDrives: number;
  numDrivingMoreThan4: number;
  numDrivingMoreThan5: number;
  numDrivingMoreThan6: number;
  /** Members driving more than their personal maximum (should normally be 0). */
  numOverMaxDrives: number;
  /** Total cars on the road across the whole cycle (both directions). */
  driverLegs: number;
  objective: number;
  bestObjectiveBound: number;
  elapsedSeconds: number;
}

export interface PlanSolveStats {
  /** CP-SAT status name, e.g. "OPTIMAL" or "FEASIBLE". */
  status: string;
  wallTimeSeconds: number;
  solutionCount: number;
  stoppedByUser: boolean;
  /** True only when the search completed and the plan is provably the best one. */
  provenOptimal: boolean;
  metrics: PlanSolutionMetrics | null;
}

/** One line of the NDJSON stream from POST /api/v1/drivingplan/stream. */
export type PlanStreamEvent =
  | { type: 'job'; jobId: string }
  | { type: 'status'; phase: 'timetables' | 'solving' | 'fallback'; message: string }
  | { type: 'progress'; metrics: PlanSolutionMetrics }
  | { type: 'solved'; stats: PlanSolveStats }
  | { type: 'heartbeat' }
  | { type: 'final'; plan: DrivingPlan }
  | { type: 'error'; message: string };

export interface PlanGenerationState {
  /** Human-readable description of what the backend is doing right now. */
  phaseMessage: string;
  /** Best solution so far, or null while the solver is still warming up. */
  metrics: PlanSolutionMetrics | null;
  /** Set once the solve has ended, before the final plan is applied. */
  stats: PlanSolveStats | null;
  /** True from the moment Stop was requested until the plan arrives. */
  stopping: boolean;
}
