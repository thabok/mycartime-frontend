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

export const buildMembersByShorthand = (members: Member[]): Map<string, Member> => {
  const map = new Map<string, Member>();
  members.forEach(m => map.set(m.shorthand.toLowerCase(), m));
  return map;
};

// plan.summary lines look like "- Name (Shorthand): Count" - see
// backend's PlanBuilder.generate_summary(). Each Count is the number of
// distinct days that member drove (both legs of a day count once), summed
// across the full two-week A/B cycle.
const SUMMARY_LINE = /^-\s*(.+?)\s*\(([^)]+)\):\s*(\d+)$/;

export const getTotalDriveCount = (summary: string): number =>
  summary
    .split('\n')
    .map((line) => line.match(SUMMARY_LINE))
    .filter((match): match is RegExpMatchArray => match !== null)
    .reduce((total, match) => total + parseInt(match[3], 10), 0);

const NBSP = String.fromCharCode(160);

// Format shorthand as "FirstName (Shorthand)" with a non-breaking space so the
// pair never wraps across lines.
export const formatPersonDisplay = (shorthand: string, membersByShorthand: Map<string, Member>): string => {
  const member = membersByShorthand.get(shorthand.toLowerCase());
  if (member) {
    return `${member.firstName}${NBSP}(${member.shorthand})`;
  }
  return shorthand;
};
