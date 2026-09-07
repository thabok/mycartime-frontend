import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { CustomDay, Member, MemberTimetableDetail, MemberTimetableSlot, TimetableNameCandidates, TimetablePeriodVariant } from '@/types/carpool';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { DAY_NAMES, formatTime } from '@/lib/planFormat';
import { getCachedMemberTimetable, fetchMemberTimetableDetail, setCachedMemberTimetable } from '@/lib/timetableCache';

interface MemberTimetableViewProps {
  member: Member;
  referenceDate?: Date;
}

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

// Pixels-per-minute of the day timeline, and the minimum height given to a
// period block so its text stays readable even for very short periods.
const PX_PER_MINUTE = 1.1;
const MIN_BLOCK_HEIGHT = 32;
const DAY_LABEL_HEIGHT = 20;
const DEFAULT_RANGE: [number, number] = [8 * 60, 16 * 60];

const isCustomPrefActive = (customDay?: CustomDay): customDay is CustomDay =>
  !!customDay && (
    customDay.ignoreCompletely || customDay.noWaitingAfternoon || customDay.needsCar ||
    customDay.drivingSkip || customDay.skipMorning || customDay.skipAfternoon ||
    !!customDay.customStart || !!customDay.customEnd
  );

const minutesFromHHMM = (time: number): number => Math.floor(time / 100) * 60 + (time % 100);
const minutesToHHMM = (minutes: number): number => Math.floor(minutes / 60) * 100 + (minutes % 60);

// WebUntis period type codes (the 'lstype' field), used as a last-resort
// display name for subject-less periods that aren't break supervision.
const LSTYPE_LABELS: Record<string, string> = {
  ls: 'Lesson',
  oh: 'Office Hour',
  sb: 'Standby',
  ex: 'Examination',
};

interface PeriodDisplay {
  title: string;
  /** True once the room is already folded into `title`, so callers should
   * leave it out of any separate room/class meta line. */
  roomInTitle: boolean;
}

/**
 * Some WebUntis period types (break supervision, office hours, ...) have no
 * subject at all. Break supervision ('bs') never carries a useful text
 * field for this school, but the room does mean something (which floor/area
 * is being supervised), so it's used as the name instead. Other subject-less
 * types fall back to whichever raw text field the school actually
 * populates; see nameCandidatesTooltip for how to check/override that guess.
 */
function resolvePeriodDisplay(subject: string | null, room: string | null, candidates: TimetableNameCandidates | null): PeriodDisplay {
  if (subject) return { title: subject, roomInTitle: false };
  if (candidates?.lstype === 'bs') {
    return { title: room ?? 'Unknown room', roomInTitle: true };
  }
  if (!candidates) return { title: 'Timetable', roomInTitle: false };
  const title =
    candidates.activityType ||
    candidates.lstext ||
    candidates.info ||
    candidates.substText ||
    (candidates.lstype && LSTYPE_LABELS[candidates.lstype]) ||
    candidates.lstype ||
    'Timetable';
  return { title, roomInTitle: false };
}

function nameCandidatesTooltip(candidates: TimetableNameCandidates | null | undefined): string | undefined {
  if (!candidates) return undefined;
  const parts = Object.entries(candidates).filter(([, value]) => value);
  if (parts.length === 0) return undefined;
  return `No subject - raw fields: ${parts.map(([key, value]) => `${key}=${value}`).join(', ')}`;
}

/** Key used to decide whether two periods share the same "name" for merge
 * purposes: the subject when there is one, otherwise the raw name-candidate
 * fields (so two different subject-less periods, e.g. two different break
 * supervision texts, aren't merged just because both lack a subject). */
function periodNameKey(period: TimetablePeriodVariant): string {
  return period.subject ?? JSON.stringify(period.nameCandidates);
}

function mergeTextField(a: string | null, b: string | null): string | null {
  if (a === b) return a;
  return [a, b].filter(Boolean).join(', ');
}

/** Merge back-to-back periods (p1.endTime === p2.startTime) that share the
 * same name into a single continuous block, so e.g. a double lesson shows
 * as one entry instead of two adjacent ones. */
function mergeAdjacentPeriods(periods: TimetablePeriodVariant[]): TimetablePeriodVariant[] {
  const sorted = [...periods].sort((a, b) => a.startTime - b.startTime);
  const merged: TimetablePeriodVariant[] = [];
  for (const period of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.endTime === period.startTime && periodNameKey(last) === periodNameKey(period)) {
      merged[merged.length - 1] = {
        ...last,
        endTime: period.endTime,
        room: mergeTextField(last.room, period.room),
        klasse: mergeTextField(last.klasse, period.klasse),
        occurrences: Math.min(last.occurrences, period.occurrences),
        frequency: Math.min(last.frequency, period.frequency),
      };
    } else {
      merged.push(period);
    }
  }
  return merged;
}

interface CalendarEntry {
  key: string;
  startTime: number;
  endTime: number;
  title: string;
  meta?: string;
  excluded?: boolean;
  reason?: string;
  tooltip?: string;
}

function buildDayEntries(slot: MemberTimetableSlot | undefined, showDetails: boolean, showExcluded: boolean): CalendarEntry[] {
  if (!slot) return [];
  const entries: CalendarEntry[] = [];

  if (!showDetails) {
    if (slot.isPresent && slot.scheduledStartTime != null && slot.scheduledEndTime != null) {
      entries.push({
        key: 'summary',
        startTime: slot.scheduledStartTime,
        endTime: slot.scheduledEndTime,
        title: 'Timetable',
      });
    }
    return entries;
  }

  mergeAdjacentPeriods(slot.relevantPeriods).forEach((period, idx) => {
    const { title, roomInTitle } = resolvePeriodDisplay(period.subject, period.room, period.nameCandidates);
    entries.push({
      key: `r-${idx}`,
      startTime: period.startTime,
      endTime: period.endTime,
      title,
      meta: [!roomInTitle && period.room, period.klasse].filter(Boolean).join(' · ') || undefined,
      tooltip: nameCandidatesTooltip(period.nameCandidates),
    });
  });

  if (showExcluded) {
    mergeAdjacentPeriods(slot.excludedPeriods).forEach((period, idx) => {
      const { title, roomInTitle } = resolvePeriodDisplay(period.subject, period.room, period.nameCandidates);
      const candidatesTooltip = nameCandidatesTooltip(period.nameCandidates);
      entries.push({
        key: `e-${idx}`,
        startTime: period.startTime,
        endTime: period.endTime,
        title,
        meta: [!roomInTitle && period.room, period.klasse].filter(Boolean).join(' · ') || undefined,
        excluded: true,
        reason: period.reason,
        tooltip: [period.reason && `Excluded: ${period.reason}`, candidatesTooltip].filter(Boolean).join(' | ') || undefined,
      });
    });
  }

  return entries.sort((a, b) => a.startTime - b.startTime);
}

/** Bounds are computed from the whole detail response (both weeks, relevant + excluded) so the timeline scale stays stable across week/toggle changes instead of jumping around. */
function computeTimelineBounds(detail: MemberTimetableDetail | null): [number, number] {
  const times: number[] = [];
  detail?.slots.forEach((slot) => {
    [...slot.relevantPeriods, ...slot.excludedPeriods].forEach((period) => {
      times.push(minutesFromHHMM(period.startTime), minutesFromHHMM(period.endTime));
    });
  });
  if (times.length === 0) return DEFAULT_RANGE;
  return [Math.floor(Math.min(...times) / 60) * 60, Math.ceil(Math.max(...times) / 60) * 60];
}

export function MemberTimetableView({ member, referenceDate }: MemberTimetableViewProps) {
  const [username] = useLocalStorage<string>('carpool-username', '');
  const [password] = useSessionStorage<string>('carpool-password', '');
  const [isWeekA, setIsWeekA] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [showExcluded, setShowExcluded] = useState(false);
  const [detail, setDetail] = useState<MemberTimetableDetail | null>(
    () => getCachedMemberTimetable(member.initials)?.detail ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCredentials = !!username.trim() && !!password.trim();

  useEffect(() => {
    const cached = getCachedMemberTimetable(member.initials);
    setDetail(cached?.detail ?? null);
    setError(null);

    if (!hasCredentials || !referenceDate || !member.initials) {
      return;
    }

    let cancelled = false;
    if (!cached) setIsLoading(true);

    fetchMemberTimetableDetail(member, referenceDate, username.trim(), password)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setCachedMemberTimetable(member.initials, data);
      })
      .catch((err) => {
        console.error('Failed to load member timetable:', err);
        if (!cancelled && !cached) setError('Could not load timetable data from WebUntis.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.initials, referenceDate, hasCredentials]);

  const [rangeStart, rangeEnd] = useMemo(() => computeTimelineBounds(detail), [detail]);
  const totalHeight = (rangeEnd - rangeStart) * PX_PER_MINUTE;
  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = rangeStart; m <= rangeEnd; m += 60) marks.push(m);
    return marks;
  }, [rangeStart, rangeEnd]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsWeekA((w) => !w)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium w-20 text-center">Week {isWeekA ? 'A' : 'B'}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsWeekA((w) => !w)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading timetable data...
        </div>
      )}

      {!isLoading && error && (
        <div className="text-sm text-destructive-foreground bg-destructive/10 rounded-lg p-3">{error}</div>
      )}

      {!isLoading && !hasCredentials && !detail && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
          Enter WebUntis credentials on the Generate Plan screen to see timetable data from WebUntis. Custom
          preferences below are still shown.
        </div>
      )}

      {!isLoading && !hasCredentials && detail && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
          Showing cached WebUntis data. Enter credentials on the Generate Plan screen to refresh it.
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative shrink-0 w-9" style={{ marginTop: DAY_LABEL_HEIGHT, height: totalHeight }}>
          {hourMarks.map((m) => (
            <div
              key={m}
              className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
              style={{ top: (m - rangeStart) * PX_PER_MINUTE }}
            >
              {formatTime(minutesToHHMM(m))}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-2 flex-1">
          {WEEKDAYS.map((day, idx) => {
            const dayNum = isWeekA ? idx : idx + 5;
            const slot = detail?.slots.find((s) => s.dayOfWeekABCombo.uniqueNumber === dayNum + 1);
            const customDay = member.customDays?.[dayNum.toString()];
            const showCustomPref = isCustomPrefActive(customDay);
            const entries = buildDayEntries(slot, showDetails, showExcluded);

            const groups = new Map<number, CalendarEntry[]>();
            entries.forEach((entry) => {
              const group = groups.get(entry.startTime) ?? [];
              group.push(entry);
              groups.set(entry.startTime, group);
            });

            return (
              <div key={day} className="flex flex-col gap-1.5">
                <div
                  className="text-xs font-medium text-muted-foreground text-center flex items-center justify-center"
                  style={{ height: DAY_LABEL_HEIGHT }}
                >
                  {DAY_NAMES[day].slice(0, 3)}
                </div>

                <div className="relative rounded-md border border-border bg-muted/10" style={{ height: totalHeight }}>
                  {hourMarks.map((m) => (
                    <div
                      key={m}
                      className="absolute left-0 right-0 border-t border-border/40"
                      style={{ top: (m - rangeStart) * PX_PER_MINUTE }}
                    />
                  ))}

                  {Array.from(groups.entries()).flatMap(([, group]) =>
                    group.map((entry, i) => {
                      const top = (minutesFromHHMM(entry.startTime) - rangeStart) * PX_PER_MINUTE;
                      const height = Math.max(
                        MIN_BLOCK_HEIGHT,
                        (minutesFromHHMM(entry.endTime) - minutesFromHHMM(entry.startTime)) * PX_PER_MINUTE
                      );
                      const widthPct = 100 / group.length;
                      return (
                        <div
                          key={entry.key}
                          title={entry.tooltip}
                          className={`absolute rounded-sm border overflow-hidden px-1 py-0.5 ${
                            entry.excluded
                              ? 'border-dashed border-destructive/40 bg-destructive/5'
                              : 'border-border bg-background'
                          }`}
                          style={{ top, height, left: `${i * widthPct}%`, width: `calc(${widthPct}% - 2px)` }}
                        >
                          <div className={`text-[10px] font-medium leading-tight truncate ${entry.excluded ? 'line-through text-muted-foreground' : ''}`}>
                            {entry.title}
                          </div>
                          <div className="text-[9px] text-muted-foreground truncate">
                            {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
                          </div>
                          {entry.meta && (
                            <div className="text-[9px] text-muted-foreground truncate">{entry.meta}</div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {entries.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground italic px-1 text-center">
                      No timetable information.
                    </div>
                  )}
                </div>

                {showCustomPref && customDay && (
                  <div className="rounded-md border border-border px-2 py-1.5 bg-secondary/30">
                    <div className="text-[10px] font-medium">Custom pref</div>
                    <div className="text-[10px] text-muted-foreground">
                      {customDay.ignoreCompletely
                        ? 'Skipped'
                        : [customDay.customStart, customDay.customEnd].filter(Boolean).join(' - ') || 'No custom times'}
                    </div>
                    {[
                      customDay.needsCar && 'needs car',
                      customDay.drivingSkip && 'no car',
                      customDay.skipMorning && 'solo AM',
                      customDay.skipAfternoon && 'solo PM',
                      customDay.noWaitingAfternoon && 'no wait PM',
                    ].filter(Boolean).length > 0 && (
                      <div className="text-[9px] text-muted-foreground truncate">
                        {[
                          customDay.needsCar && 'needs car',
                          customDay.drivingSkip && 'no car',
                          customDay.skipMorning && 'solo AM',
                          customDay.skipAfternoon && 'solo PM',
                          customDay.noWaitingAfternoon && 'no wait PM',
                        ].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 pt-1">
        <div className="flex items-center gap-2">
          <Switch id="show-details" checked={showDetails} onCheckedChange={setShowDetails} />
          <Label htmlFor="show-details" className="text-sm">Show details</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-excluded" checked={showExcluded} onCheckedChange={setShowExcluded} />
          <Label htmlFor="show-excluded" className="text-sm">Show excluded items</Label>
        </div>
      </div>
    </div>
  );
}
