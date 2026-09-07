import { format } from 'date-fns';
import { getWeekMonday } from '@/lib/planDates';

interface WeekSeparatorProps {
  isWeekA: boolean;
  referenceDate?: Date;
}

export function WeekSeparator({ isWeekA, referenceDate }: WeekSeparatorProps) {
  const label = isWeekA ? 'Week A' : 'Week B';
  const dateLabel = referenceDate ? format(getWeekMonday(referenceDate, isWeekA), 'MMM d, yyyy') : null;

  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center px-4">
        <div className="w-full border-t-2 border-primary/20" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-background px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
          {dateLabel && <> &middot; {dateLabel}</>}
        </span>
      </div>
    </div>
  );
}
