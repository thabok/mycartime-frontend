import { describe, expect, it } from 'vitest';
import { applyCreateMember, applyDeleteMember, applyImportMembers, applyUpdateMember, sortMembers } from './memberActions';
import { Member } from '@/types/carpool';

const buildMember = (overrides: Partial<Member> = {}): Member => ({
  firstName: 'Rabea',
  lastName: 'Wirth',
  initials: 'Wr',
  numberOfSeats: 5,
  ...overrides,
});

describe('sortMembers', () => {
  it('sorts by last name, then first name', () => {
    const members = [
      buildMember({ firstName: 'Tim', lastName: 'Kiel', initials: 'Ki' }),
      buildMember({ firstName: 'Anna', lastName: 'Adler', initials: 'Aa' }),
      buildMember({ firstName: 'Bea', lastName: 'Adler', initials: 'Ba' }),
    ];
    expect(sortMembers(members).map(m => m.initials)).toEqual(['Aa', 'Ba', 'Ki']);
  });
});

describe('applyCreateMember', () => {
  it('appends and re-sorts', () => {
    const existing = [buildMember({ firstName: 'Tim', lastName: 'Kiel', initials: 'Ki' })];
    const result = applyCreateMember(existing, buildMember({ firstName: 'Anna', lastName: 'Adler', initials: 'Aa' }));
    expect(result.map(m => m.initials)).toEqual(['Aa', 'Ki']);
  });
});

describe('applyUpdateMember', () => {
  it('replaces the member matching the given initials', () => {
    const existing = [buildMember({ initials: 'Wr', numberOfSeats: 5 })];
    const result = applyUpdateMember(existing, 'Wr', buildMember({ initials: 'Wr', numberOfSeats: 7 }));
    expect(result).toHaveLength(1);
    expect(result[0].numberOfSeats).toBe(7);
  });

  it('leaves other members untouched', () => {
    const existing = [
      buildMember({ firstName: 'Tim', lastName: 'Kiel', initials: 'Ki' }),
      buildMember({ firstName: 'Rabea', lastName: 'Wirth', initials: 'Wr' }),
    ];
    const result = applyUpdateMember(existing, 'Wr', buildMember({ firstName: 'Rabea', lastName: 'Wirth', initials: 'Wr', numberOfSeats: 9 }));
    expect(result.find(m => m.initials === 'Ki')?.numberOfSeats).toBe(5);
  });
});

describe('applyDeleteMember', () => {
  it('removes the member matching the given initials', () => {
    const existing = [
      buildMember({ initials: 'Ki' }),
      buildMember({ initials: 'Wr' }),
    ];
    const result = applyDeleteMember(existing, 'Ki');
    expect(result.map(m => m.initials)).toEqual(['Wr']);
  });
});

describe('applyImportMembers', () => {
  it('replaces the entire member list and sorts it', () => {
    const existing = [buildMember({ firstName: 'Old', lastName: 'Member', initials: 'Om' })];
    const imported = [
      buildMember({ firstName: 'Tim', lastName: 'Kiel', initials: 'Ki' }),
      buildMember({ firstName: 'Anna', lastName: 'Adler', initials: 'Aa' }),
    ];
    const result = applyImportMembers(existing, imported);
    expect(result.map(m => m.initials)).toEqual(['Aa', 'Ki']);
  });
});
