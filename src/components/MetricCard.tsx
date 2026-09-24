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

/**
 * Larger standalone variant of {@link Metric} for a single headline stat,
 * e.g. the Summary page's primary "drives saved" figure sitting above its
 * supporting {@link MetricsGrid}.
 */
export function HeroMetric({
  label,
  value,
  tooltip,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  /** Detailed explanation shown on hover; omit for a plain, non-interactive card. */
  tooltip?: ReactNode;
  icon?: LucideIcon;
}) {
  const card = (
    <div className="w-full rounded-md border bg-muted/30 px-6 py-5 flex items-center justify-center gap-4">
      {Icon && <Icon className="h-9 w-9 text-primary flex-shrink-0" />}
      <div className="text-center">
        <div className="text-4xl font-bold tabular-nums leading-tight">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );

  if (!tooltip) {
    return card;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">{card}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-sm">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
