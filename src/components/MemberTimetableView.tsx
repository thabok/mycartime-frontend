import { MouseEvent, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { CustomDay, Member, MemberTimetableDetail, MemberTimetableSlot, TimetableNameCandidates, TimetablePeriodVariant } from '@/types/carpool';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useWebuntisCredentials } from '@/hooks/useWebuntisCredentials';
import { DAY_NAMES, formatTime } from '@/lib/planFormat';
import { getCachedMemberTimetable, fetchMemberTimetableDetail, setCachedMemberTimetable } from '@/lib/timetableCache';

interface MemberTimetableViewProps {
  member: Member;
  referenceDate?: Date;
  /** Pre-selects the week (A/B) the timetable opens on, e.g. when navigating
   * here from a specific day's entry elsewhere in the app. */
  initialWeekA?: boolean;
  /** Highlights this day's entire column on open, e.g. when navigating here
   * from a specific day's entry elsewhere in the app. */
  initialHighlightDay?: (typeof WEEKDAYS)[number];
}

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

// Pixels-per-minute of the day timeline, and the minimum height given to a
// period block so its title always fits even for very short periods.
const PX_PER_MINUTE = 1.1;
const MIN_BLOCK_HEIGHT = 16;
// Approximate rendered height of one text line inside a block, used to
// decide how many of its (title / time / meta) lines actually fit.
const BLOCK_LINE_HEIGHT = 11;
// Height that fits exactly two text lines. Used for custom start/end
// markers (which always show label + time) and to grow otherwise
// single-line items that have room to breathe (see layoutDayEntries callers).
const TWO_LINE_HEIGHT = 30;
const DAY_LABEL_HEIGHT = 20;
const DEFAULT_RANGE: [number, number] = [8 * 60, 16 * 60];

/** Short labels for the always-on-day custom-pref flags, shown as plain text
 * beneath the timetable (not as timetable items themselves). */
function customDayDetailTexts(customDay: CustomDay | undefined): string[] {
  if (!customDay) return [];
  if (customDay.ignoreCompletely) return ['Skipped'];
  return [
    customDay.needsCar && 'needs car',
    customDay.drivingSkip && 'no car',
    customDay.skipMorning && 'solo AM',
    customDay.skipAfternoon && 'solo PM',
    customDay.noWaitingAfternoon && 'no wait PM',
  ].filter((text): text is string => !!text);
}

const minutesFromHHMM = (time: number): number => Math.floor(time / 100) * 60 + (time % 100);
const minutesToHHMM = (minutes: number): number => Math.floor(minutes / 60) * 100 + (minutes % 60);

/** Parses a "HH:MM" string (as stored on CustomDay) into the HHMM number
 * format used everywhere else (e.g. "08:00" -> 800). */
const parseHHMM = (value: string | undefined): number | null => {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 100 + parseInt(match[2], 10);
};

type EntryCategory = 'lesson' | 'break-supervision' | 'custom-pref';
type LegendCategory = EntryCategory | 'excluded';

/** Border/background classes and legend label per category, so items are
 * visually distinguishable at a glance and the legend/rendering share a
 * single source of truth. Excluded periods use a dedicated dashed style
 * regardless of their underlying category. */
const CATEGORY_STYLES: Record<LegendCategory, { block: string; label: string }> = {
  lesson: { block: 'border-blue-400/60 bg-blue-400/10', label: 'Lesson' },
  'break-supervision': { block: 'border-violet-400/60 bg-violet-400/10', label: 'Break supervision' },
  'custom-pref': { block: 'border-amber-400/60 bg-amber-400/10', label: 'Custom pref' },
  excluded: { block: 'border-dashed border-slate-400/60 bg-slate-400/10', label: 'Excluded' },
};

function categoryClasses(entry: Pick<CalendarEntry, 'category' | 'excluded'>): string {
  return CATEGORY_STYLES[entry.excluded ? 'excluded' : entry.category ?? 'lesson'].block;
}

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
  category?: EntryCategory;
  /** Overrides the default "start–end" time line, e.g. for custom start/end
   * markers that anchor a single time rather than a range. */
  timeLabel?: string;
}

/** Always builds a non-empty tooltip so it shows for every item (not just
 * ones with unresolved raw fields), and always includes the time range
 * since it isn't always legible in a tight schedule. */
function buildTooltip(title: string, startTime: number, endTime: number, extras: (string | undefined)[]): string {
  const timeRange = `${formatTime(startTime)}–${formatTime(endTime)}`;
  return [title, timeRange, ...extras].filter(Boolean).join(' · ');
}

/** True if some other *real* item (never a custom-pref marker, which gets
 * stretched to fill gaps around the real schedule and must never be the
 * reason a real item's display is squeezed) starts within 30 minutes after
 * this entry ends. */
function hasFollowingSoon(entry: CalendarEntry, siblings: CalendarEntry[]): boolean {
  const entryEnd = minutesFromHHMM(entry.endTime);
  return siblings.some((other) => {
    if (other.key === entry.key || other.category === 'custom-pref') return false;
    const otherStart = minutesFromHHMM(other.startTime);
    return otherStart >= entryEnd && otherStart - entryEnd <= 30;
  });
}

/** The pixel height an entry will render at: its natural duration, floored
 * at MIN_BLOCK_HEIGHT, and grown to fit two lines when nothing follows soon
 * (see hasFollowingSoon) so a short item like a 10-minute break supervision
 * still shows its time instead of just a truncated title. */
function computeEntryHeight(entry: CalendarEntry, siblings: CalendarEntry[]): number {
  const naturalHeight = (minutesFromHHMM(entry.endTime) - minutesFromHHMM(entry.startTime)) * PX_PER_MINUTE;
  const height = Math.max(MIN_BLOCK_HEIGHT, naturalHeight);
  const linesFit = Math.max(1, Math.floor(height / BLOCK_LINE_HEIGHT));
  if (linesFit === 1 && !hasFollowingSoon(entry, siblings)) {
    return Math.max(height, TWO_LINE_HEIGHT);
  }
  return height;
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
    const meta = [!roomInTitle && period.room, period.klasse].filter(Boolean).join(' · ') || undefined;
    const category: EntryCategory = period.nameCandidates?.lstype === 'bs' ? 'break-supervision' : 'lesson';
    // Break supervision never has a real subject to begin with (its title is
    // the room instead), so the "no subject / raw fields" tooltip would just
    // be noise there.
    const candidatesTooltip = category === 'break-supervision' ? undefined : nameCandidatesTooltip(period.nameCandidates);
    entries.push({
      key: `r-${idx}`,
      startTime: period.startTime,
      endTime: period.endTime,
      title,
      meta,
      category,
      tooltip: buildTooltip(title, period.startTime, period.endTime, [meta, candidatesTooltip]),
    });
  });

  if (showExcluded) {
    mergeAdjacentPeriods(slot.excludedPeriods).forEach((period, idx) => {
      const { title, roomInTitle } = resolvePeriodDisplay(period.subject, period.room, period.nameCandidates);
      const meta = [!roomInTitle && period.room, period.klasse].filter(Boolean).join(' · ') || undefined;
      const category: EntryCategory = period.nameCandidates?.lstype === 'bs' ? 'break-supervision' : 'lesson';
      const candidatesTooltip = category === 'break-supervision' ? undefined : nameCandidatesTooltip(period.nameCandidates);
      entries.push({
        key: `e-${idx}`,
        startTime: period.startTime,
        endTime: period.endTime,
        title,
        meta,
        category,
        excluded: true,
        reason: period.reason,
        tooltip: buildTooltip(title, period.startTime, period.endTime, [
          meta,
          period.reason && `Excluded: ${period.reason}`,
          candidatesTooltip,
        ]),
      });
    });
  }

  return entries.sort((a, b) => a.startTime - b.startTime);
}

/** Builds the inline timetable item(s) for a custom start/end preference, per
 * the three display modes: both times set (a single spanning block), or only
 * one of the two set (a small anchored marker at that time).
 *
 * When only one boundary is set and it falls outside the day's other items
 * (custom start earlier than everything else, or custom end later than
 * everything else), the marker is stretched to fill that gap - up to the
 * next item's start, or from the previous item's end - instead of using its
 * small fixed-size fallback, so it reads as "nothing else happens here"
 * rather than a fixed-size label with unexplained blank space around it. */
function buildCustomPrefEntries(customDay: CustomDay | undefined, dayEntries: CalendarEntry[]): CalendarEntry[] {
  if (!customDay || customDay.ignoreCompletely) return [];
  const start = parseHHMM(customDay.customStart);
  const end = parseHHMM(customDay.customEnd);
  if (start == null && end == null) return [];

  const markerMinutes = TWO_LINE_HEIGHT / PX_PER_MINUTE;

  if (start != null && end != null) {
    return [{
      key: 'custom-pref-both',
      startTime: start,
      endTime: end,
      title: 'Custom times:',
      category: 'custom-pref',
      tooltip: buildTooltip('Custom times', start, end, []),
    }];
  }

  if (start != null) {
    const startMinutes = minutesFromHHMM(start);
    const nextItem = dayEntries
      .filter((item) => minutesFromHHMM(item.startTime) > startMinutes)
      .sort((a, b) => a.startTime - b.startTime)[0];
    const endTime = nextItem ? nextItem.startTime : minutesToHHMM(startMinutes + markerMinutes);
    return [{
      key: 'custom-pref-start',
      startTime: start,
      endTime,
      title: 'Custom start',
      category: 'custom-pref',
      timeLabel: formatTime(start),
      tooltip: `Custom start · ${formatTime(start)}`,
    }];
  }

  const endValue = end as number;
  const endMinutes = minutesFromHHMM(endValue);
  const prevItem = dayEntries
    .filter((item) => minutesFromHHMM(item.endTime) < endMinutes)
    .sort((a, b) => b.endTime - a.endTime)[0];
  let startTime: number;
  if (prevItem) {
    // Use the previous item's *rendered* bottom, not its nominal end time: a
    // short item (e.g. a 10-minute break supervision) may render taller than
    // its actual duration for readability, and the marker must start after
    // that visual bottom, not overlap it.
    const visualHeightMinutes = computeEntryHeight(prevItem, dayEntries) / PX_PER_MINUTE;
    const visualEndMinutes = minutesFromHHMM(prevItem.startTime) + visualHeightMinutes;
    startTime = minutesToHHMM(Math.ceil(Math.max(minutesFromHHMM(prevItem.endTime), visualEndMinutes)));
  } else {
    startTime = minutesToHHMM(endMinutes - markerMinutes);
  }
  return [{
    key: 'custom-pref-end',
    startTime,
    endTime: endValue,
    title: 'Custom end',
    category: 'custom-pref',
    timeLabel: formatTime(endValue),
    tooltip: `Custom end · ${formatTime(endValue)}`,
  }];
}

/** Bounds are computed from the whole detail response (both weeks, relevant + excluded) plus any
 * custom start/end times, so the timeline scale stays stable across week/toggle changes and
 * custom-pref markers never fall outside the visible range. */
function computeTimelineBounds(detail: MemberTimetableDetail | null, customDays: Record<string, CustomDay> | undefined): [number, number] {
  const times: number[] = [];
  detail?.slots.forEach((slot) => {
    [...slot.relevantPeriods, ...slot.excludedPeriods].forEach((period) => {
      times.push(minutesFromHHMM(period.startTime), minutesFromHHMM(period.endTime));
    });
  });
  Object.values(customDays ?? {}).forEach((customDay) => {
    const start = parseHHMM(customDay.customStart);
    const end = parseHHMM(customDay.customEnd);
    if (start != null) times.push(minutesFromHHMM(start));
    if (end != null) times.push(minutesFromHHMM(end));
  });
  if (times.length === 0) return DEFAULT_RANGE;
  return [Math.floor(Math.min(...times) / 60) * 60, Math.ceil(Math.max(...times) / 60) * 60];
}

interface PositionedEntry extends CalendarEntry {
  colIndex: number;
  colCount: number;
}

/**
 * Packs entries into side-by-side columns wherever they overlap in time, so
 * overlapping items never sit on top of one another (their semi-transparent
 * backgrounds would otherwise make overlapping text unreadable). Entries are
 * grouped into clusters of mutually-overlapping items; within each cluster,
 * columns are assigned greedily (reusing a column once its previous entry
 * has ended) and every entry in the cluster gets the cluster's total column
 * count, so same-cluster items line up at equal widths like in a calendar.
 */
function layoutDayEntries(entries: CalendarEntry[]): PositionedEntry[] {
  const sorted = [...entries].sort((a, b) => minutesFromHHMM(a.startTime) - minutesFromHHMM(b.startTime));
  const result: PositionedEntry[] = [];

  let cluster: { entry: CalendarEntry; colIndex: number }[] = [];
  let clusterEnd = -Infinity;
  const columnEnds: number[] = [];

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const colCount = columnEnds.length;
    cluster.forEach(({ entry, colIndex }) => result.push({ ...entry, colIndex, colCount }));
    cluster = [];
    columnEnds.length = 0;
    clusterEnd = -Infinity;
  };

  sorted.forEach((entry) => {
    const start = minutesFromHHMM(entry.startTime);
    const end = minutesFromHHMM(entry.endTime);
    if (cluster.length > 0 && start >= clusterEnd) {
      flushCluster();
    }
    let colIndex = columnEnds.findIndex((colEnd) => colEnd <= start);
    if (colIndex === -1) {
      colIndex = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[colIndex] = end;
    }
    cluster.push({ entry, colIndex });
    clusterEnd = Math.max(clusterEnd, end);
  });
  flushCluster();

  return result;
}

interface VisualEntry extends PositionedEntry {
  top: number;
  height: number;
  displayTitle: string;
  timeText: string;
  showTimeLine: boolean;
  showMeta: boolean;
}

/**
 * Turns positioned entries into final pixel boxes: natural top/height (grown
 * to two lines where safe, per computeEntryHeight), the title/time-line
 * display decision, and a same-column pass that shifts an entry's box
 * upward whenever its computed height would otherwise dip into the next
 * entry sharing its column - e.g. a short break supervision immediately
 * followed by a lesson - so items never visually overlap even though their
 * nominal times don't.
 */
function computeVisualEntries(positioned: PositionedEntry[], rangeStart: number): VisualEntry[] {
  const withBoxes: VisualEntry[] = positioned.map((entry) => {
    const top = (minutesFromHHMM(entry.startTime) - rangeStart) * PX_PER_MINUTE;
    const height = computeEntryHeight(entry, positioned);
    const linesFit = Math.max(1, Math.floor(height / BLOCK_LINE_HEIGHT));
    const timeText = entry.timeLabel ?? `${formatTime(entry.startTime)}–${formatTime(entry.endTime)}`;

    const displayTitle = linesFit === 1 && hasFollowingSoon(entry, positioned)
      ? `${entry.title} · ${timeText}`
      : entry.title;
    const showTimeLine = linesFit >= 2;
    const showMeta = !!entry.meta && linesFit >= 3;

    return { ...entry, top, height, displayTitle, timeText, showTimeLine, showMeta };
  });

  const byColumn = new Map<number, VisualEntry[]>();
  withBoxes.forEach((entry) => {
    const list = byColumn.get(entry.colIndex) ?? [];
    list.push(entry);
    byColumn.set(entry.colIndex, list);
  });

  byColumn.forEach((columnEntries) => {
    columnEntries.sort((a, b) => a.top - b.top);
    for (let i = 0; i < columnEntries.length - 1; i++) {
      const current = columnEntries[i];
      const next = columnEntries[i + 1];
      const bottom = current.top + current.height;
      if (bottom > next.top) {
        current.top = next.top - current.height;
      }
    }
  });

  return withBoxes;
}

export function MemberTimetableView({ member, referenceDate, initialWeekA, initialHighlightDay }: MemberTimetableViewProps) {
  const { hasCredentials, credentialFields } = useWebuntisCredentials();
  const [isWeekA, setIsWeekA] = useState(initialWeekA ?? true);
  const [showDetails, setShowDetails] = useState(true);
  const [showExcluded, setShowExcluded] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [highlightedDay, setHighlightedDay] = useState<(typeof WEEKDAYS)[number] | null>(initialHighlightDay ?? null);

  /** Clears both the entry selection and the whole-day highlight; used
   * whenever the user clicks empty space in the timetable. */
  const clearSelection = () => {
    setSelectedKeys(new Set());
    setHighlightedDay(null);
  };

  /** Selecting an entry has no effect beyond the visual highlight: plain
   * click replaces the selection, Shift/Cmd(Ctrl)-click toggles the entry
   * within it, allowing multi-select. */
  const handleEntrySelect = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    setSelectedKeys((prev) => {
      if (!additive) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [detail, setDetail] = useState<MemberTimetableDetail | null>(
    () => getCachedMemberTimetable(member.initials)?.detail ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = getCachedMemberTimetable(member.initials);
    setDetail(cached?.detail ?? null);
    setError(null);

    if (!hasCredentials || !referenceDate || !member.initials) {
      return;
    }

    let cancelled = false;
    if (!cached) setIsLoading(true);

    fetchMemberTimetableDetail(member, referenceDate, credentialFields)
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

  const hasExcludedItems = useMemo(
    () => !!detail?.slots.some((slot) => slot.excludedPeriods.length > 0),
    [detail]
  );

  useEffect(() => {
    if (!hasExcludedItems) setShowExcluded(false);
  }, [hasExcludedItems]);

  const [rangeStart, rangeEnd] = useMemo(() => computeTimelineBounds(detail, member.customDays), [detail, member.customDays]);
  const totalHeight = (rangeEnd - rangeStart) * PX_PER_MINUTE;
  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = rangeStart; m <= rangeEnd; m += 60) marks.push(m);
    return marks;
  }, [rangeStart, rangeEnd]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 items-center gap-2">
        <div className="flex items-center gap-3 justify-self-start">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsWeekA((w) => !w)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-16 text-center">Week {isWeekA ? 'A' : 'B'}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsWeekA((w) => !w)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground justify-self-center">
          {(Object.keys(CATEGORY_STYLES) as LegendCategory[])
            .filter((key) => key !== 'excluded' || hasExcludedItems)
            .map((key) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm border ${CATEGORY_STYLES[key].block}`} />
                {CATEGORY_STYLES[key].label}
              </span>
            ))}
        </div>

        <div className="flex items-center flex-wrap gap-4 justify-self-end">
          <div className="flex items-center gap-2">
            <Checkbox id="show-details" checked={showDetails} onCheckedChange={(checked) => setShowDetails(!!checked)} />
            <Label htmlFor="show-details" className="text-xs">Show details</Label>
          </div>
          {hasExcludedItems && (
            <div className="flex items-center gap-2">
              <Checkbox id="show-excluded" checked={showExcluded} onCheckedChange={(checked) => setShowExcluded(!!checked)} />
              <Label htmlFor="show-excluded" className="text-xs">Show excluded items</Label>
            </div>
          )}
        </div>
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
            const detailTexts = customDayDetailTexts(customDay);
            const dayEntries = buildDayEntries(slot, showDetails, showExcluded);
            const entries = [...dayEntries, ...buildCustomPrefEntries(customDay, dayEntries)];
            const positioned = layoutDayEntries(entries);
            const visualEntries = computeVisualEntries(positioned, rangeStart);

            return (
              <div key={day} className="flex flex-col gap-1.5">
                <div
                  className="text-xs font-medium text-muted-foreground text-center flex items-center justify-center"
                  style={{ height: DAY_LABEL_HEIGHT }}
                >
                  {DAY_NAMES[day].slice(0, 3)}
                </div>

                <div
                  className={`relative rounded-md border bg-muted/10 ${
                    highlightedDay === day ? 'border-2 border-primary ring-2 ring-primary ring-offset-1' : 'border-border'
                  }`}
                  style={{ height: totalHeight }}
                  onClick={clearSelection}
                >
                  {hourMarks.map((m) => (
                    <div
                      key={m}
                      className="absolute left-0 right-0 border-t border-border/40"
                      style={{ top: (m - rangeStart) * PX_PER_MINUTE }}
                    />
                  ))}

                  {visualEntries.map((entry) => {
                    const widthPct = 100 / entry.colCount;
                    const selectionId = `${day}-${entry.key}`;
                    const isSelected = selectedKeys.has(selectionId);
                    return (
                      <div
                        key={entry.key}
                        title={entry.tooltip}
                        onClick={(event) => handleEntrySelect(selectionId, event)}
                        className={`absolute rounded-[4px] overflow-hidden px-1 py-0.5 cursor-pointer ${categoryClasses(entry)} ${
                          isSelected ? 'border-2 ring-2 ring-primary ring-offset-1' : 'border'
                        }`}
                        style={{
                          top: entry.top,
                          height: entry.height,
                          left: `${entry.colIndex * widthPct}%`,
                          width: `calc(${widthPct}% - 2px)`,
                        }}
                      >
                        <div className={`text-[10px] font-medium leading-tight truncate ${entry.excluded ? 'line-through text-muted-foreground' : ''}`}>
                          {entry.displayTitle}
                        </div>
                        {entry.showTimeLine && (
                          <div className="text-[9px] text-muted-foreground truncate">
                            {entry.timeText}
                          </div>
                        )}
                        {entry.showMeta && (
                          <div className="text-[9px] text-muted-foreground truncate">{entry.meta}</div>
                        )}
                      </div>
                    );
                  })}

                  {entries.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground italic px-1 text-center">
                      No timetable information.
                    </div>
                  )}
                </div>

                {detailTexts.length > 0 && (
                  <div className="text-[9px] text-muted-foreground italic text-center truncate">
                    {detailTexts.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
