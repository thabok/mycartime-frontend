export interface CustomDay {
  ignoreCompletely: boolean;
  noWaitingAfternoon: boolean;
  needsCar: boolean;
  drivingSkip: boolean;
  skipMorning: boolean;
  skipAfternoon: boolean;
  customStart: string;
  customEnd: string;
}

export interface Member {
  firstName: string;
  lastName: string;
  initials: string;
  numberOfSeats: number;
  isPartTime?: boolean;
  customDays?: Record<string, CustomDay>;
}

export interface DayOfWeekABCombo {
  dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';
  isWeekA: boolean;
  uniqueNumber: number;
}

export interface Party {
  dayOfWeekABCombo: DayOfWeekABCombo;
  driver: string;
  time: number;
  passengers: string[];
  isDesignatedDriver: boolean;
  drivesDespiteCustomPrefs: boolean;
  isLonelyDriver: boolean;
  schoolbound: boolean;
  poolName?: string;
  creationPhase?: number;
}

export interface TimeInfo {
  timetableTime: number | null;
  customPrefTime: number | null;
  effectiveTime: number;
}

export interface DayPlan {
  dayOfWeekABCombo: DayOfWeekABCombo;
  parties: Party[];
  schoolboundTimesByInitials: Record<string, number>;
  homeboundTimesByInitials: Record<string, number>;
  schoolboundTimeInfoByInitials?: Record<string, TimeInfo>;
  homeboundTimeInfoByInitials?: Record<string, TimeInfo>;
}

export interface DrivingPlan {
  summary: string;
  dayPlans: Record<string, DayPlan>;
  memberIdMap?: Record<string, string>;
  scheduleUrlTemplate?: string;
}

export type ViewMode = 'members' | 'plan';
export type MemberViewMode = 'card' | 'list';

// Raw WebUntis text fields that might name a period with no subject (e.g.
// break supervision, office hours) - only present when subject is null.
export interface TimetableNameCandidates {
  activityType: string | null;
  lstext: string | null;
  info: string | null;
  substText: string | null;
  lstype: string | null;
  sg: string | null;
}

export interface TimetablePeriodVariant {
  startTime: number;
  endTime: number;
  subject: string | null;
  room: string | null;
  klasse: string | null;
  teacher: string | null;
  occurrences: number;
  frequency: number;
  reason?: string; // only present on excluded variants
  nameCandidates: TimetableNameCandidates | null;
}

export interface MemberTimetableSlot {
  dayOfWeekABCombo: DayOfWeekABCombo;
  totalOccurrences: number;
  scheduledStartTime: number | null;
  scheduledEndTime: number | null;
  effectiveStartTime: number | null;
  effectiveEndTime: number | null;
  isPresent: boolean;
  customPref: CustomDay | null;
  relevantPeriods: TimetablePeriodVariant[];
  excludedPeriods: TimetablePeriodVariant[];
}

export interface MemberTimetableDetail {
  initials: string;
  queryRangeStart: string;
  queryRangeEnd: string;
  slots: MemberTimetableSlot[]; // 10 entries, day_num order
}
