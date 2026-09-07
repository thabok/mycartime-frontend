import { Member, MemberTimetableDetail } from '@/types/carpool';

const CACHE_KEY = 'carpool-timetable-cache';

export interface CachedMemberTimetable {
  detail: MemberTimetableDetail;
  fetchedAt: string;
}

type TimetableCache = Record<string, CachedMemberTimetable>;

function readCache(): TimetableCache {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) as TimetableCache : {};
  } catch (error) {
    console.error('Error reading timetable cache:', error);
    return {};
  }
}

function writeCache(cache: TimetableCache): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error writing timetable cache:', error);
  }
}

export function getCachedMemberTimetable(initials: string): CachedMemberTimetable | undefined {
  if (!initials) return undefined;
  return readCache()[initials];
}

export function setCachedMemberTimetable(initials: string, detail: MemberTimetableDetail): void {
  if (!initials) return;
  const cache = readCache();
  cache[initials] = { detail, fetchedAt: new Date().toISOString() };
  writeCache(cache);
}

const formatDateForApi = (date: Date): string => {
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

export async function fetchMemberTimetableDetail(
  member: Member,
  referenceDate: Date,
  username: string,
  password: string,
): Promise<MemberTimetableDetail> {
  const backendHostAndPort = 'http://' + window.location.hostname + ':1338';
  const response = await fetch(`${backendHostAndPort}/api/v1/membertimetable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person: member,
      scheduleReferenceStartDate: formatDateForApi(referenceDate),
      username: username.trim(),
      hash: btoa(password),
    }),
  });
  if (!response.ok) throw new Error(`Server responded with ${response.status}`);
  return response.json() as Promise<MemberTimetableDetail>;
}

/** Re-fetches and re-caches every member's timetable detail; meant to be called right after a driving plan is (re)generated, since the credentials are on hand and the backend's own WebUntis query cache is already warm from generating that plan. Best-effort: failures for individual members are swallowed so one member's issue doesn't block the others. */
export async function refreshTimetableCache(
  members: Member[],
  referenceDate: Date,
  username: string,
  password: string,
): Promise<void> {
  await Promise.allSettled(
    members
      .filter((member) => member.initials)
      .map(async (member) => {
        const detail = await fetchMemberTimetableDetail(member, referenceDate, username, password);
        setCachedMemberTimetable(member.initials, detail);
      })
  );
}
