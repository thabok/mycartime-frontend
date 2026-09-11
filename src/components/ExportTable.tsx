import { DrivingPlan, DayPlan, Party, Member } from '@/types/carpool';
import { DAY_NAMES, formatTime, buildMembersByInitials, formatPersonDisplay } from '@/lib/planFormat';
import { cn } from '@/lib/utils';
import { WeekSeparator } from '@/components/WeekSeparator';
import { Flag, UserRoundX } from 'lucide-react';

// Purely presentational: one week's table with no surrounding app chrome. The
// element marked data-export-capture is what gets rasterised (see
// lib/exportPng.ts), so nothing outside it ends up in the PNG.
export interface ExportTableProps {
  plan: DrivingPlan;
  members: Member[];
  referenceDate?: Date;
  showDesignatedDriver: boolean;
  showSoloDriver: boolean;
  isWeekA: boolean;
}

export function ExportTable({
  plan,
  members,
  referenceDate,
  showDesignatedDriver,
  showSoloDriver,
  isWeekA,
}: ExportTableProps) {
  const membersByInitials = buildMembersByInitials(members);
  const formatPerson = (initials: string) => formatPersonDisplay(initials, membersByInitials);

  const filteredDayPlans = Object.entries(plan.dayPlans)
    .filter(([, dayPlan]) => dayPlan.dayOfWeekABCombo.isWeekA === isWeekA)
    .sort(([a], [b]) => parseInt(a) - parseInt(b));

  const renderPartyLine = (party: Party, isLast: boolean) => (
    <div
      key={`${party.driver}-${party.time}`}
      className={cn(
        "text-sm leading-tight py-0.5 pl-[7ch] whitespace-nowrap",
        !isLast && "border-b border-border/30"
      )}
      style={{ textIndent: '-7ch' }}
    >
      <span className="text-muted-foreground font-mono">[{formatTime(party.time)}]</span>
      {' '}
      <span className="font-semibold">
        {party.isLonelyDriver ? (
          showSoloDriver && <UserRoundX className="inline h-3.5 w-3.5 mb-0.5 mr-1 text-muted-foreground" />
        ) : party.isDesignatedDriver ? (
          showDesignatedDriver && <Flag className="inline h-3.5 w-3.5 mb-0.5 mr-1 text-muted-foreground" />
        ) : null}
        {formatPerson(party.driver)}
      </span>
      {party.passengers.length > 0 && (
        <span className="text-muted-foreground">
          {' · '}
          {party.passengers.map((initials, idx) => (
            <span key={initials}>
              {idx > 0 && ' · '}
              {formatPerson(initials)}
            </span>
          ))}
        </span>
      )}
    </div>
  );

  const renderDayRow = ([dayKey, dayPlan]: [string, DayPlan]) => {
    const { dayOfWeekABCombo, parties } = dayPlan;
    const schoolboundParties = parties.filter(p => p.schoolbound === true).sort((a, b) => a.time - b.time);
    const homeboundParties = parties.filter(p => p.schoolbound === false).sort((a, b) => a.time - b.time);

    return (
      <tr key={dayKey} className="border-b border-border/50">
        <td className="py-1.5 px-4 align-top whitespace-nowrap font-medium">
          <div>{DAY_NAMES[dayOfWeekABCombo.dayOfWeek]}</div>
        </td>
        <td className="py-1.5 px-4 align-top">
          {schoolboundParties.length > 0 ? (
            <div>{schoolboundParties.map((party, idx) => renderPartyLine(party, idx === schoolboundParties.length - 1))}</div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>
        <td className="py-1.5 px-4 align-top">
          {homeboundParties.length > 0 ? (
            <div>{homeboundParties.map((party, idx) => renderPartyLine(party, idx === homeboundParties.length - 1))}</div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div data-export-capture="true" className="bg-background text-foreground p-6 w-fit mx-auto space-y-2">
      <WeekSeparator isWeekA={isWeekA} referenceDate={referenceDate} />
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-auto">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="py-2 px-4 text-left text-sm font-semibold text-foreground">Day</th>
              <th className="py-2 px-4 text-left text-sm font-semibold text-foreground">Schoolbound</th>
              <th className="py-2 px-4 text-left text-sm font-semibold text-foreground">Homebound</th>
            </tr>
          </thead>
          <tbody>
            {filteredDayPlans.map(renderDayRow)}
          </tbody>
        </table>
      </div>
      {(showDesignatedDriver || showSoloDriver) && (
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
          {showDesignatedDriver && (
            <span className="flex items-center gap-1">
              <Flag className="h-3.5 w-3.5" /> designated driver
            </span>
          )}
          {showSoloDriver && (
            <span className="flex items-center gap-1">
              <UserRoundX className="h-3.5 w-3.5" /> solo driver (no passengers)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
