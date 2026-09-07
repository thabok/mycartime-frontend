import { Member } from '@/types/carpool';

export const DAY_NAMES: Record<string, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
};

export const formatTime = (time: number): string => {
  const hours = Math.floor(time / 100);
  const minutes = time % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

export const buildMembersByInitials = (members: Member[]): Map<string, Member> => {
  const map = new Map<string, Member>();
  members.forEach(m => map.set(m.initials.toLowerCase(), m));
  return map;
};

const NBSP = String.fromCharCode(160);

// Format initials as "FirstName (Initials)" with a non-breaking space so the
// pair never wraps across lines.
export const formatPersonDisplay = (initials: string, membersByInitials: Map<string, Member>): string => {
  const member = membersByInitials.get(initials.toLowerCase());
  if (member) {
    return `${member.firstName}${NBSP}(${member.initials})`;
  }
  return initials;
};
