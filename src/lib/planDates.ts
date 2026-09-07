import { startOfWeek, addDays } from 'date-fns';

/** The Monday of the week containing the week-A reference date. */
export function getWeekAMonday(referenceDate: Date): Date {
  return startOfWeek(referenceDate, { weekStartsOn: 1 });
}

/** The Monday of week A or week B, derived from the week-A reference date. */
export function getWeekMonday(referenceDate: Date, isWeekA: boolean): Date {
  const weekAMonday = getWeekAMonday(referenceDate);
  return isWeekA ? weekAMonday : addDays(weekAMonday, 7);
}
