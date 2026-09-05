import { DrivingPlan, Party } from '@/types/carpool';

/**
 * A stable identity for a party within a driving plan. Parties don't carry
 * their own id, but (day, direction, driver, time) uniquely identifies the
 * "slot" a party occupies - edits (e.g. transferring a passenger) change the
 * passenger list of a party without changing its driver/time.
 */
export function partyKey(dayKey: string, party: Party): string {
  return `${dayKey}|${party.schoolbound}|${party.driver}|${party.time}`;
}

// A signature of everything about a party other than its identity, used to
// detect whether a party was actually changed (vs. just re-serialized).
function partySignature(party: Party): string {
  return JSON.stringify({
    passengers: [...party.passengers].sort(),
    isDesignatedDriver: party.isDesignatedDriver,
    drivesDespiteCustomPrefs: party.drivesDespiteCustomPrefs,
    isLonelyDriver: party.isLonelyDriver,
    poolName: party.poolName ?? null,
  });
}

/**
 * Diffs two driving plans and returns the set of party keys (see
 * `partyKey`) that were added or changed in `newPlan` relative to
 * `oldPlan`. Used to highlight parties that were just modified, regardless
 * of how the change was made (Day Plan Editor, a direct API call, the AI
 * assistant, ...) - anything that ends up calling `onPlanChange` with an
 * updated plan is covered.
 */
export function diffModifiedPartyKeys(oldPlan: DrivingPlan | null, newPlan: DrivingPlan): Set<string> {
  const modified = new Set<string>();
  if (!oldPlan) return modified;

  for (const [dayKey, newDayPlan] of Object.entries(newPlan.dayPlans)) {
    const oldDayPlan = oldPlan.dayPlans[dayKey];
    for (const party of newDayPlan.parties) {
      const key = partyKey(dayKey, party);
      const oldParty = oldDayPlan?.parties.find(
        p => p.schoolbound === party.schoolbound && p.driver === party.driver && p.time === party.time
      );
      if (!oldParty || partySignature(oldParty) !== partySignature(party)) {
        modified.add(key);
      }
    }
  }
  return modified;
}
