import { Member } from '@/types/carpool';

// Mirrors config.DEFAULT_TARGET_DRIVE_COUNT_* in the backend, which applies
// the same defaults to members without an explicit targetDriveCount.
export const DEFAULT_TARGET_DRIVE_COUNT_FULLTIME = 4;
export const DEFAULT_TARGET_DRIVE_COUNT_PARTTIME = 3;
export const DEFAULT_TARGET_DRIVE_COUNT_NON_ALTERNATING = 2;

export function defaultTargetDriveCount(isPartTime: boolean | undefined, alternatingWeeks: boolean): number {
  if (!alternatingWeeks) return DEFAULT_TARGET_DRIVE_COUNT_NON_ALTERNATING;
  return isPartTime ? DEFAULT_TARGET_DRIVE_COUNT_PARTTIME : DEFAULT_TARGET_DRIVE_COUNT_FULLTIME;
}

export function hasCustomTargetDriveCount(member: Member, alternatingWeeks: boolean): boolean {
  return member.targetDriveCount !== undefined &&
    member.targetDriveCount !== defaultTargetDriveCount(member.isPartTime, alternatingWeeks);
}

export function withDefaultTargetDriveCount(member: Member): Member {
  const rest = { ...member };
  delete rest.targetDriveCount;
  return rest;
}
