import { ArmchairIcon, CalendarCheck2, LifeBuoy, UserCheck } from 'lucide-react';
import { QualityMetrics } from '@/types/carpool';
import { Metric, MetricsGrid } from './MetricCard';
import { DAY_NAMES, formatTime } from '@/lib/planFormat';

/** 0=Monday .. 4=Friday, matching the backend's weekdaysA/weekdaysB indices. */
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const formatWeekdays = (weekdays: number[]): string =>
  weekdays.length > 0 ? weekdays.map((w) => WEEKDAY_LABELS[w]).join(' + ') : 'none';

const formatPerson = (person: { shorthand: string; firstName: string }): string =>
  `${person.firstName} (${person.shorthand})`;

/**
 * "How good is this plan" cards for the summary tab. Definitions mirror
 * backend/src/plan_quality.py's compute_quality_metrics() exactly - see that
 * module's docstring if these numbers ever look surprising.
 */
export function PlanQualityMetrics({ metrics }: { metrics: QualityMetrics }) {
  const notPackedValue = 100 - metrics.packedParties.value;
  const notPackedCount = metrics.packedParties.totalRides - metrics.packedParties.packedCount;
  const notPackedHint = metrics.packedParties.totalRides > 0
    ? `${notPackedCount} of ${metrics.packedParties.totalRides} parties don't need someone to sit in the infamous back row middle seat`
    : 'no rides';

  // Both A/B metrics are absent for plans without alternating weeks.
  const abDriverMismatch = metrics.abDriverMismatch;
  const passengerAbStability = metrics.passengerAbStability;
  const alternatingWeeks = Boolean(abDriverMismatch || passengerAbStability);

  return (
    <MetricsGrid columns={alternatingWeeks ? 4 : 2}>
      <Metric
        label="Flexibility"
        value={`${metrics.flexibility.value}%`}
        hint={`${metrics.flexibility.coveredRides} of ${metrics.flexibility.totalRidesWithPassengers} rides have a backup in case a driver drops out on short notice`}
        icon={LifeBuoy}
        tooltip={
          <>
            <p className="mt-1">
              For {metrics.flexibility.coveredRides} of {metrics.flexibility.totalRidesWithPassengers} parties, the passengers can be accommodated by another party if the driver calls in sick.
              <br/><br/>
              A party counts as able to help only if they still have a free seat and the times fit within the usual tolerance and no-waiting-afternoon rules.
            </p>
          </>
        }
      />
      <Metric
        label="No middle seat needed"
        value={`${notPackedValue}%`}
        hint={notPackedHint}
        icon={ArmchairIcon} />
      {abDriverMismatch && (
      <Metric
        label="Matched driving days A/B"
        value={`${100 - abDriverMismatch.value}%`}
        hint={`${abDriverMismatch.totalMembers - abDriverMismatch.mismatchedCount} of ${abDriverMismatch.totalMembers} members have matched A/B driving days`}
        icon={CalendarCheck2}
        tooltip={
          <>Members with unmatched A/B driving days:<br/><br/>
            {abDriverMismatch.members.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5">
                {abDriverMismatch.members.map((m) => (
                  <li key={m.shorthand}>
                    <span className="font-bold">{m.firstName} ({m.shorthand})</span>
                    <ul className="space-y-0.5">
                      <li key={m.shorthand + '-week-a'}>A: {formatWeekdays(m.weekdaysA)}</li>
                      <li key={m.shorthand + '-week-b'}>B: {formatWeekdays(m.weekdaysB)}</li>
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </>
        }
      />
      )}
      {passengerAbStability && (
        <Metric
          label="Same driver A/B"
          value={`${passengerAbStability.value}%`}
          hint={`In ${passengerAbStability.matchedCount} of ${passengerAbStability.totalComparableRides} rides, passengers keep the same driver A/B`}
          icon={UserCheck}
        />
      )}
    </MetricsGrid>
  );
}
