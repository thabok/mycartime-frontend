import { describe, expect, it } from 'vitest';
import { cleanImportedMembers, normalizeTimeString, parseImportedMembers } from './memberImport';
import { CustomDay, Member } from '@/types/carpool';

const emptyDay = (): CustomDay => ({
  ignoreCompletely: false,
  noWaitingAfternoon: false,
  needsCar: false,
  drivingSkip: false,
  skipMorning: false,
  skipAfternoon: false,
  customStart: '',
  customEnd: '',
});

describe('normalizeTimeString', () => {
  it('leaves an empty string untouched', () => {
    expect(normalizeTimeString('')).toBe('');
  });

  it('pads a single-digit hour', () => {
    expect(normalizeTimeString('9:25')).toBe('09:25');
  });

  it('pads a single-digit minute', () => {
    expect(normalizeTimeString('14:5')).toBe('14:05');
  });

  it('pads both a single-digit hour and minute', () => {
    expect(normalizeTimeString('9:5')).toBe('09:05');
  });

  it('leaves an already zero-padded value untouched', () => {
    expect(normalizeTimeString('09:25')).toBe('09:25');
  });

  it('leaves unrecognizable values untouched instead of throwing', () => {
    expect(normalizeTimeString('noon')).toBe('noon');
  });
});

describe('cleanImportedMembers', () => {
  const buildMember = (overrides: Partial<Member> = {}): Member => ({
    firstName: 'Rabea',
    lastName: 'Wirth',
    initials: 'Wr',
    numberOfSeats: 5,
    ...overrides,
  });

  it('carries over basic fields untouched', () => {
    const [result] = cleanImportedMembers([
      buildMember({ firstName: 'Tim', lastName: 'Kiel', initials: 'Ki', numberOfSeats: 3 }),
    ]);
    expect(result).toEqual({
      firstName: 'Tim',
      lastName: 'Kiel',
      initials: 'Ki',
      numberOfSeats: 3,
    });
  });

  it('preserves isPartTime when true and when false', () => {
    const [partTime, fullTime] = cleanImportedMembers([
      buildMember({ initials: 'Pt', isPartTime: true }),
      buildMember({ initials: 'Ft', isPartTime: false }),
    ]);
    expect(partTime.isPartTime).toBe(true);
    expect(fullTime.isPartTime).toBe(false);
  });

  it('drops customDays entirely when every entry equals the default value', () => {
    const [result] = cleanImportedMembers([
      buildMember({
        customDays: {
          '0': emptyDay(),
          '1': emptyDay(),
        },
      }),
    ]);
    expect(result.customDays).toBeUndefined();
  });

  it('leaves customDays undefined when the member has none', () => {
    const [result] = cleanImportedMembers([buildMember()]);
    expect(result.customDays).toBeUndefined();
  });

  it('reproduces the reported bug: a single-digit-hour customEnd is preserved and zero-padded', () => {
    // Regression test for the Rabea Wirth (Wr) import: customDays["1"].customEnd
    // was "9:25", which <input type="time"> silently renders as blank because
    // the browser requires the zero-padded "HH:MM" format.
    const [result] = cleanImportedMembers([
      buildMember({
        customDays: {
          '1': { ...emptyDay(), customEnd: '9:25' },
        },
      }),
    ]);
    expect(result.customDays?.['1'].customEnd).toBe('09:25');
  });

  it('keeps an already zero-padded customStart untouched', () => {
    const [result] = cleanImportedMembers([
      buildMember({
        customDays: {
          '2': { ...emptyDay(), customStart: '11:40' },
        },
      }),
    ]);
    expect(result.customDays?.['2'].customStart).toBe('11:40');
  });

  it('handles an "ignore completely" (Skip) day', () => {
    const [result] = cleanImportedMembers([
      buildMember({
        customDays: {
          '0': { ...emptyDay(), ignoreCompletely: true },
        },
      }),
    ]);
    expect(result.customDays?.['0']).toMatchObject({ ignoreCompletely: true });
  });

  it('handles a "needs car" day with a single-digit start and a zero-padded end', () => {
    const [result] = cleanImportedMembers([
      buildMember({
        customDays: {
          '3': { ...emptyDay(), needsCar: true, customStart: '9:5', customEnd: '17:30' },
        },
      }),
    ]);
    expect(result.customDays?.['3']).toEqual({
      ignoreCompletely: false,
      noWaitingAfternoon: false,
      needsCar: true,
      drivingSkip: false,
      skipMorning: false,
      skipAfternoon: false,
      customStart: '09:05',
      customEnd: '17:30',
    });
  });

  it('handles a "no car" day combined with "no wait PM" and a single-digit end time', () => {
    const [result] = cleanImportedMembers([
      buildMember({
        customDays: {
          '4': { ...emptyDay(), drivingSkip: true, noWaitingAfternoon: true, customEnd: '8:0' },
        },
      }),
    ]);
    expect(result.customDays?.['4']).toMatchObject({
      drivingSkip: true,
      noWaitingAfternoon: true,
      customEnd: '08:00',
    });
  });

  it('handles a "solo AM" day (implies needsCar in the UI) with a custom start time', () => {
    const [result] = cleanImportedMembers([
      buildMember({
        customDays: {
          '5': { ...emptyDay(), skipMorning: true, needsCar: true, customStart: '7:15' },
        },
      }),
    ]);
    expect(result.customDays?.['5']).toMatchObject({
      skipMorning: true,
      needsCar: true,
      customStart: '07:15',
    });
  });

  it('handles a "solo PM" day (implies needsCar, excludes noWaitingAfternoon) with a custom end time', () => {
    const [result] = cleanImportedMembers([
      buildMember({
        customDays: {
          '6': {
            ...emptyDay(),
            skipAfternoon: true,
            needsCar: true,
            noWaitingAfternoon: false,
            customEnd: '9:25',
          },
        },
      }),
    ]);
    expect(result.customDays?.['6']).toMatchObject({
      skipAfternoon: true,
      needsCar: true,
      noWaitingAfternoon: false,
      customEnd: '09:25',
    });
  });

  it('keeps a day with only a custom time set (no flags) instead of treating it as default', () => {
    const [result] = cleanImportedMembers([
      buildMember({
        customDays: {
          '7': { ...emptyDay(), customStart: '9:0' },
        },
      }),
    ]);
    expect(result.customDays?.['7'].customStart).toBe('09:00');
  });

  it('handles multiple members and multiple days independently', () => {
    const [rabea, tim] = cleanImportedMembers([
      buildMember({
        firstName: 'Rabea',
        lastName: 'Wirth',
        initials: 'Wr',
        customDays: {
          '1': { ...emptyDay(), customEnd: '9:25' },
          '3': { ...emptyDay(), noWaitingAfternoon: true, needsCar: true },
        },
      }),
      buildMember({
        firstName: 'Tim',
        lastName: 'Kiel',
        initials: 'Ki',
        customDays: {
          '2': { ...emptyDay(), customStart: '11:40' },
          '9': emptyDay(),
        },
      }),
    ]);

    expect(rabea.customDays?.['1'].customEnd).toBe('09:25');
    expect(rabea.customDays?.['3']).toMatchObject({ noWaitingAfternoon: true, needsCar: true });
    expect(tim.customDays?.['2'].customStart).toBe('11:40');
    expect(tim.customDays?.['9']).toBeUndefined(); // default day gets stripped
  });
});

describe('parseImportedMembers', () => {
  it('parses a JSON array and applies the same cleanup as cleanImportedMembers', () => {
    const json = JSON.stringify([
      {
        firstName: 'Rabea',
        lastName: 'Wirth',
        initials: 'Wr',
        numberOfSeats: 5,
        customDays: {
          '1': { ...emptyDay(), customEnd: '9:25' },
        },
      },
    ]);

    const [result] = parseImportedMembers(json);
    expect(result.customDays?.['1'].customEnd).toBe('09:25');
  });

  it('throws when the JSON root is not an array', () => {
    expect(() => parseImportedMembers(JSON.stringify({ firstName: 'Not an array' }))).toThrow();
  });

  it('throws on malformed JSON', () => {
    expect(() => parseImportedMembers('{not valid json')).toThrow();
  });
});
