import { describe, expect, it } from 'vitest';
import { applyTransfers, canApplyTransfers, canTransferPassenger, findDayKeyByUniqueNumber } from './dayPlanActions';
import { DrivingPlan, DayPlan, Member, Party } from '@/types/carpool';

const buildMember = (overrides: Partial<Member> = {}): Member => ({
  firstName: 'First',
  lastName: 'Last',
  initials: 'AB',
  numberOfSeats: 4,
  ...overrides,
});

const buildParty = (overrides: Partial<Party> = {}): Party => ({
  dayOfWeekABCombo: { dayOfWeek: 'MONDAY', isWeekA: true, uniqueNumber: 1 },
  driver: 'AB',
  time: 755,
  passengers: [],
  isDesignatedDriver: false,
  drivesDespiteCustomPrefs: false,
  isLonelyDriver: false,
  schoolbound: true,
  ...overrides,
});

const buildDayPlan = (parties: Party[]): DayPlan => ({
  dayOfWeekABCombo: { dayOfWeek: 'MONDAY', isWeekA: true, uniqueNumber: 1 },
  parties,
  schoolboundTimesByInitials: {},
  homeboundTimesByInitials: {},
});

const buildPlan = (dayPlan: DayPlan): DrivingPlan => ({
  summary: '',
  dayPlans: { '1': dayPlan },
});

describe('canTransferPassenger', () => {
  it('allows moving a passenger between same-direction parties', () => {
    const dayPlan = buildDayPlan([
      buildParty({ driver: 'AB', time: 755, passengers: ['CD'] }),
      buildParty({ driver: 'EF', time: 800, passengers: [] }),
    ]);
    const ok = canTransferPassenger(dayPlan, {
      passenger: 'CD',
      fromParty: { driver: 'AB', time: 755 },
      toParty: { driver: 'EF', time: 800 },
    });
    expect(ok).toBe(true);
  });

  it('rejects a transfer across directions', () => {
    const dayPlan = buildDayPlan([
      buildParty({ driver: 'AB', time: 755, passengers: ['CD'], schoolbound: true }),
      buildParty({ driver: 'EF', time: 1600, passengers: [], schoolbound: false }),
    ]);
    const ok = canTransferPassenger(dayPlan, {
      passenger: 'CD',
      fromParty: { driver: 'AB', time: 755 },
      toParty: { driver: 'EF', time: 1600 },
    });
    expect(ok).toBe(false);
  });

  it('rejects a transfer targeting a lonely-driver party', () => {
    const dayPlan = buildDayPlan([
      buildParty({ driver: 'AB', time: 755, passengers: ['CD'] }),
      buildParty({ driver: 'EF', time: 800, passengers: [], isLonelyDriver: true }),
    ]);
    const ok = canTransferPassenger(dayPlan, {
      passenger: 'CD',
      fromParty: { driver: 'AB', time: 755 },
      toParty: { driver: 'EF', time: 800 },
    });
    expect(ok).toBe(false);
  });

  it('rejects a passenger who is not actually in the source party', () => {
    const dayPlan = buildDayPlan([
      buildParty({ driver: 'AB', time: 755, passengers: [] }),
      buildParty({ driver: 'EF', time: 800, passengers: [] }),
    ]);
    const ok = canTransferPassenger(dayPlan, {
      passenger: 'CD',
      fromParty: { driver: 'AB', time: 755 },
      toParty: { driver: 'EF', time: 800 },
    });
    expect(ok).toBe(false);
  });
});

describe('canApplyTransfers', () => {
  it('allows a swap that would overfill a car partway through but nets out', () => {
    // Both cars have 2 seats (capacity for 1 passenger) and are already full.
    const dayPlan = buildDayPlan([
      buildParty({ driver: 'AB', time: 755, passengers: ['CD'] }),
      buildParty({ driver: 'EF', time: 800, passengers: ['GH'] }),
    ]);
    const members = [buildMember({ initials: 'AB', numberOfSeats: 2 }), buildMember({ initials: 'EF', numberOfSeats: 2 })];

    const ok = canApplyTransfers(dayPlan, [
      { passenger: 'CD', fromParty: { driver: 'AB', time: 755 }, toParty: { driver: 'EF', time: 800 } },
      { passenger: 'GH', fromParty: { driver: 'EF', time: 800 }, toParty: { driver: 'AB', time: 755 } },
    ], members);

    expect(ok).toBe(true);
  });

  it('rejects a batch whose net result overfills a car', () => {
    const dayPlan = buildDayPlan([
      buildParty({ driver: 'AB', time: 755, passengers: ['CD'] }),
      buildParty({ driver: 'EF', time: 800, passengers: ['GH'] }),
    ]);
    const members = [buildMember({ initials: 'AB', numberOfSeats: 2 }), buildMember({ initials: 'EF', numberOfSeats: 2 })];

    const ok = canApplyTransfers(dayPlan, [
      { passenger: 'GH', fromParty: { driver: 'EF', time: 800 }, toParty: { driver: 'AB', time: 755 } },
    ], members);

    expect(ok).toBe(false);
  });

  it('treats an unknown driver as having unlimited capacity', () => {
    const dayPlan = buildDayPlan([
      buildParty({ driver: 'AB', time: 755, passengers: ['CD'] }),
      buildParty({ driver: 'EF', time: 800, passengers: [] }),
    ]);

    const ok = canApplyTransfers(dayPlan, [
      { passenger: 'CD', fromParty: { driver: 'AB', time: 755 }, toParty: { driver: 'EF', time: 800 } },
    ], []);

    expect(ok).toBe(true);
  });
});

describe('findDayKeyByUniqueNumber', () => {
  it('finds the dayPlans key matching a uniqueNumber', () => {
    const plan = buildPlan(buildDayPlan([]));
    expect(findDayKeyByUniqueNumber(plan, 1)).toBe('1');
    expect(findDayKeyByUniqueNumber(plan, 2)).toBeUndefined();
  });
});

describe('applyTransfers', () => {
  it('moves the passenger from the source to the target party', () => {
    const dayPlan = buildDayPlan([
      buildParty({ driver: 'AB', time: 755, passengers: ['CD'] }),
      buildParty({ driver: 'EF', time: 800, passengers: [] }),
    ]);
    const plan = buildPlan(dayPlan);

    const updated = applyTransfers(plan, 1, [
      { passenger: 'CD', fromParty: { driver: 'AB', time: 755 }, toParty: { driver: 'EF', time: 800 } },
    ]);

    const updatedDayPlan = updated.dayPlans['1'];
    expect(updatedDayPlan.parties.find(p => p.driver === 'AB')?.passengers).toEqual([]);
    expect(updatedDayPlan.parties.find(p => p.driver === 'EF')?.passengers).toEqual(['CD']);
  });

  it('does not mutate the original plan', () => {
    const dayPlan = buildDayPlan([
      buildParty({ driver: 'AB', time: 755, passengers: ['CD'] }),
      buildParty({ driver: 'EF', time: 800, passengers: [] }),
    ]);
    const plan = buildPlan(dayPlan);

    applyTransfers(plan, 1, [
      { passenger: 'CD', fromParty: { driver: 'AB', time: 755 }, toParty: { driver: 'EF', time: 800 } },
    ]);

    expect(plan.dayPlans['1'].parties.find(p => p.driver === 'AB')?.passengers).toEqual(['CD']);
  });

  it('returns the plan unchanged when the day is not found', () => {
    const plan = buildPlan(buildDayPlan([]));
    const result = applyTransfers(plan, 99, []);
    expect(result).toBe(plan);
  });
});
