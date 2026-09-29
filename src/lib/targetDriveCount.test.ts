import { describe, expect, it } from 'vitest';
import { defaultTargetDriveCount, hasCustomTargetDriveCount, withDefaultTargetDriveCount } from './targetDriveCount';
import { Member } from '@/types/carpool';

const member = (overrides: Partial<Member> = {}): Member => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  shorthand: 'Al',
  numberOfSeats: 4,
  ...overrides,
});

describe('defaultTargetDriveCount', () => {
  it('distinguishes full- and part-time members with alternating weeks', () => {
    expect(defaultTargetDriveCount(false, true)).toBe(4);
    expect(defaultTargetDriveCount(true, true)).toBe(2);
  });

  it('uses the same default for everyone without alternating weeks', () => {
    expect(defaultTargetDriveCount(false, false)).toBe(2);
    expect(defaultTargetDriveCount(true, false)).toBe(2);
  });
});

describe('hasCustomTargetDriveCount', () => {
  it('is false when no value is stored', () => {
    expect(hasCustomTargetDriveCount(member(), true)).toBe(false);
  });

  it('is false when the stored value equals the default for the current mode', () => {
    expect(hasCustomTargetDriveCount(member({ targetDriveCount: 4 }), true)).toBe(false);
    expect(hasCustomTargetDriveCount(member({ isPartTime: true, targetDriveCount: 2 }), true)).toBe(false);
  });

  it('is true when the stored value differs from the default for the current mode', () => {
    expect(hasCustomTargetDriveCount(member({ targetDriveCount: 5 }), true)).toBe(true);
    expect(hasCustomTargetDriveCount(member({ targetDriveCount: 4 }), false)).toBe(true);
  });
});

describe('withDefaultTargetDriveCount', () => {
  it('drops the stored value and keeps everything else', () => {
    const result = withDefaultTargetDriveCount(member({ targetDriveCount: 6, isPartTime: true }));
    expect(result).toEqual(member({ isPartTime: true }));
    expect('targetDriveCount' in result).toBe(false);
  });
});
