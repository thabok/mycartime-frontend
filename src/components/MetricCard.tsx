import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Shared small-stat-card look used for the solver progress dialog's live
 * metrics and the finished plan's summary-tab quality metrics, so both read
 * as one visual language.
 */
export function Metric({
  label,
  value,
  hint,
  tooltip,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Detailed explanation shown on hover; omit for a plain, non-interactive card. */
  tooltip?: ReactNode;
  /** Icon shown in the card's upper right corner, indicating what the metric reflects. */
  icon?: LucideIcon;
}) {
  const card = (
    <div className="relative h-full rounded-md border bg-muted/30 px-3 py-2">
      {Icon && <Icon className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground/50" />}
      <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
      <div className="text-xs text-muted-foreground pr-4">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70 pr-4">{hint}</div>}
    </div>
  );

  if (!tooltip) {
    return card;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="h-full cursor-help">{card}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-sm">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function MetricsGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 auto-rows-fr gap-2 sm:grid-cols-4">{children}</div>;
}
