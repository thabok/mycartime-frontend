import { DrivingPlan, DayPlan, Party, Member } from '@/types/carpool';

// Shared by the Edit Day Plan dialog's apply flow (via PlanViewer) and the
// AI assistant's action runner, so both enforce the same invariants: a
// passenger transfer must stay within the same direction (schoolbound /
// homebound) and can't target a lonely-driver (solo) party.

export interface PartyRef {
  driver: string;
  time: number;
}

export interface Transfer {
  passenger: string;
  fromParty: PartyRef;
  toParty: PartyRef;
}

function findParty(dayPlan: DayPlan, ref: PartyRef): Party | undefined {
  return dayPlan.parties.find(p => p.driver === ref.driver && p.time === ref.time);
}

export function canTransferPassenger(dayPlan: DayPlan, transfer: Transfer): boolean {
  const from = findParty(dayPlan, transfer.fromParty);
  const to = findParty(dayPlan, transfer.toParty);
  if (!from || !to) return false;
  if (from.driver === to.driver && from.time === to.time) return false;
  if (!from.passengers.includes(transfer.passenger)) return false;
  if (from.schoolbound !== to.schoolbound) return false;
  if (to.isLonelyDriver) return false;
  return true;
}

// A batch of transfers (e.g. a swap: Mary out of Mo's car and Joel out of
// John's car, each into the other's) can be valid overall even though an
// individual transfer applied on its own would overfill a car partway
// through. So capacity is checked once against the *net* effect of the
// whole batch, not per transfer.
export function canApplyTransfers(dayPlan: DayPlan, transfers: Transfer[], members: Member[]): boolean {
  if (!transfers.every(transfer => canTransferPassenger(dayPlan, transfer))) return false;

  const seatsByInitials = new Map(members.map(m => [m.initials.toLowerCase(), m.numberOfSeats]));
  const key = (ref: PartyRef) => `${ref.driver}-${ref.time}`;
  const netChange = new Map<string, number>();
  transfers.forEach(transfer => {
    netChange.set(key(transfer.fromParty), (netChange.get(key(transfer.fromParty)) ?? 0) - 1);
    netChange.set(key(transfer.toParty), (netChange.get(key(transfer.toParty)) ?? 0) + 1);
  });

  return dayPlan.parties.every(party => {
    const change = netChange.get(key(party)) ?? 0;
    if (change <= 0) return true;
    const seats = seatsByInitials.get(party.driver.toLowerCase());
    if (seats === undefined) return true;
    return party.passengers.length + change <= seats - 1;
  });
}

export function findDayKeyByUniqueNumber(plan: DrivingPlan, dayUniqueNumber: number): string | undefined {
  return Object.entries(plan.dayPlans).find(
    ([, dp]) => dp.dayOfWeekABCombo.uniqueNumber === dayUniqueNumber
  )?.[0];
}

export function applyTransfers(plan: DrivingPlan, dayUniqueNumber: number, transfers: Transfer[]): DrivingPlan {
  const dayKey = findDayKeyByUniqueNumber(plan, dayUniqueNumber);
  if (!dayKey) return plan;

  const dayPlan = plan.dayPlans[dayKey];
  const updatedParties = dayPlan.parties.map(party => ({
    ...party,
    passengers: [...party.passengers],
  }));

  transfers.forEach(transfer => {
    const sourceParty = updatedParties.find(
      p => p.driver === transfer.fromParty.driver && p.time === transfer.fromParty.time
    );
    if (sourceParty) {
      sourceParty.passengers = sourceParty.passengers.filter(p => p !== transfer.passenger);
    }

    const targetParty = updatedParties.find(
      p => p.driver === transfer.toParty.driver && p.time === transfer.toParty.time
    );
    if (targetParty) {
      targetParty.passengers.push(transfer.passenger);
    }
  });

  return {
    ...plan,
    dayPlans: {
      ...plan.dayPlans,
      [dayKey]: {
        ...dayPlan,
        parties: updatedParties,
      },
    },
  };
}
