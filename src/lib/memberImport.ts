import { Member, CustomDay } from '@/types/carpool';

// Accepts "H:MM", "HH:M", "H:M" or "HH:MM" and pads to the "HH:MM" format
// required by <input type="time">. Without this, browsers silently render
// non-padded values (e.g. "9:25") as blank instead of showing the time.
const TIME_PATTERN = /^(\d{1,2}):(\d{1,2})$/;

export function normalizeTimeString(value: string): string {
  if (!value) return '';
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return value;
  const [, hours, minutes] = match;
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

const isDefaultCustomDay = (day: CustomDay) =>
  !day.ignoreCompletely &&
  !day.noWaitingAfternoon &&
  !day.needsCar &&
  !day.drivingSkip &&
  !day.skipMorning &&
  !day.skipAfternoon &&
  !day.customStart &&
  !day.customEnd;

// Removes customDay entries that are equal to the default empty value and
// normalizes time fields so they round-trip correctly through <input type="time">.
export function cleanImportedMembers(imported: Member[]): Member[] {
  return imported.map((member) => {
    if (!member.customDays) return member;

    const cleanedCustomDays: Record<string, CustomDay> = {};
    for (const [dayKey, day] of Object.entries(member.customDays)) {
      const normalizedDay: CustomDay = {
        ...day,
        customStart: normalizeTimeString(day.customStart),
        customEnd: normalizeTimeString(day.customEnd),
      };

      if (!isDefaultCustomDay(normalizedDay)) {
        cleanedCustomDays[dayKey] = normalizedDay;
      }
    }

    return {
      ...member,
      customDays: Object.keys(cleanedCustomDays).length > 0 ? cleanedCustomDays : undefined,
    };
  });
}

export function parseImportedMembers(text: string): Member[] {
  const imported = JSON.parse(text) as Member[];
  if (!Array.isArray(imported)) throw new Error('Invalid format');
  return cleanImportedMembers(imported);
}
