import { describe, expect, it } from 'vitest';
import { applyCreateMember, applyDeleteMember, applyImportMembers, applyUpdateMember, sortMembers } from './memberActions';
import { Member } from '@/types/carpool';

const buildMember = (overrides: Partial<Member> = {}): Member => ({
  firstName: 'Rabea',
  lastName: 'Wirth',
  shorthand: 'Wr',
  numberOfSeats: 5,
  ...overrides,
});

describe('sortMembers', () => {
  it('sorts by last name, then first name', () => {
    const members = [
      buildMember({ firstName: 'Tim', lastName: 'Kiel', shorthand: 'Ki' }),
      buildMember({ firstName: 'Anna', lastName: 'Adler', shorthand: 'Aa' }),
      buildMember({ firstName: 'Bea', lastName: 'Adler', shorthand: 'Ba' }),
    ];
    expect(sortMembers(members).map(m => m.shorthand)).toEqual(['Aa', 'Ba', 'Ki']);
  });
});

describe('applyCreateMember', () => {
  it('appends and re-sorts', () => {
    const existing = [buildMember({ firstName: 'Tim', lastName: 'Kiel', shorthand: 'Ki' })];
    const result = applyCreateMember(existing, buildMember({ firstName: 'Anna', lastName: 'Adler', shorthand: 'Aa' }));
    expect(result.map(m => m.shorthand)).toEqual(['Aa', 'Ki']);
  });
});

describe('applyUpdateMember', () => {
  it('replaces the member matching the given shorthand', () => {
    const existing = [buildMember({ shorthand: 'Wr', numberOfSeats: 5 })];
    const result = applyUpdateMember(existing, 'Wr', buildMember({ shorthand: 'Wr', numberOfSeats: 7 }));
    expect(result).toHaveLength(1);
    expect(result[0].numberOfSeats).toBe(7);
  });

  it('leaves other members untouched', () => {
    const existing = [
      buildMember({ firstName: 'Tim', lastName: 'Kiel', shorthand: 'Ki' }),
      buildMember({ firstName: 'Rabea', lastName: 'Wirth', shorthand: 'Wr' }),
    ];
    const result = applyUpdateMember(existing, 'Wr', buildMember({ firstName: 'Rabea', lastName: 'Wirth', shorthand: 'Wr', numberOfSeats: 9 }));
    expect(result.find(m => m.shorthand === 'Ki')?.numberOfSeats).toBe(5);
  });
});

describe('applyDeleteMember', () => {
  it('removes the member matching the given shorthand', () => {
    const existing = [
      buildMember({ shorthand: 'Ki' }),
      buildMember({ shorthand: 'Wr' }),
    ];
    const result = applyDeleteMember(existing, 'Ki');
    expect(result.map(m => m.shorthand)).toEqual(['Wr']);
  });
});

describe('applyImportMembers', () => {
  it('replaces the entire member list and sorts it', () => {
    const existing = [buildMember({ firstName: 'Old', lastName: 'Member', shorthand: 'Om' })];
    const imported = [
      buildMember({ firstName: 'Tim', lastName: 'Kiel', shorthand: 'Ki' }),
      buildMember({ firstName: 'Anna', lastName: 'Adler', shorthand: 'Aa' }),
    ];
    const result = applyImportMembers(existing, imported);
    expect(result.map(m => m.shorthand)).toEqual(['Aa', 'Ki']);
  });
});
