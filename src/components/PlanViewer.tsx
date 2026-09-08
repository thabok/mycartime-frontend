import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { DrivingPlan, DayPlan, Party, Member, DayOfWeekABCombo } from '@/types/carpool';
import { partyKey } from '@/lib/planDiff';
import { DAY_NAMES, formatTime, buildMembersByInitials } from '@/lib/planFormat';
import { getWeekMonday } from '@/lib/planDates';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, Users, FileText, Download, Image, Trash2, Flag, UserRoundX, Clock, X } from 'lucide-react';
import { cn, downloadJson } from '@/lib/utils';
import { getBackendUrl } from '@/lib/config';
import { DayPlanEditDialog } from './DayPlanEditDialog';
import { MemberDialog } from './MemberDialog';
import { WeekSeparator } from './WeekSeparator';
import { useToast } from '@/hooks/use-toast';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { applyTransfers, canApplyTransfers } from '@/lib/dayPlanActions';

interface PlanViewerProps {
  plan: DrivingPlan;
  onPlanChange: (plan: DrivingPlan) => void;
  members: Member[];
  onMembersChange: (members: Member[]) => void;
  referenceDate?: Date;
  /**
   * Keys (see `partyKey`) of parties that were just modified - via the Day
   * Plan Editor, a direct API call, or the AI assistant - so they can be
   * highlighted. Cleared by the parent on the next plan change, or manually
   * via `onClearHighlights`.
   */
  modifiedPartyKeys?: Set<string>;
  /** Clears `modifiedPartyKeys` in the parent. */
  onClearHighlights?: () => void;
}

const formatCreationPhase = (phase: number ): string => {
  let reason: string;
  switch (phase) {
    case 2:
        reason = "Initial driver selection";
        break;
    case 3:
        reason = "Rebalancing to fix over-driving members";
        break;
    case 4:
        reason = "Adding additional underutilized drivers to reduce overcrowding";
        break;
  }
  return `Phase ${phase}: ${reason}`;
};

interface Transfer {
  id: string;
  passenger: string;
  fromParty: Party;
  toParty: Party;
  hasTimeWarning: boolean;
}

interface SelectedMemberInfo {
  initials: string;
  dayPlan: DayPlan;
  party: Party;
}

type WeekFilter = 'summary' | 'all' | 'A' | 'B';
const WEEK_FILTERS: WeekFilter[] = ['summary', 'all', 'A', 'B'];

export function PlanViewer({ plan, onPlanChange, members, onMembersChange, referenceDate, modifiedPartyKeys, onClearHighlights }: PlanViewerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const weekFilter: WeekFilter = WEEK_FILTERS.includes(tabParam as WeekFilter) ? (tabParam as WeekFilter) : 'summary';
  const personFilter = searchParams.get('q') ?? '';
  const selectedMemberParam = searchParams.get('member');
  const selectedDayParam = searchParams.get('day');
  const selectedDriverParam = searchParams.get('driver');
  const selectedTimeParam = searchParams.get('time');

  const setWeekFilter = (tab: WeekFilter) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'summary') next.delete('tab'); else next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  const setPersonFilter = (query: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (query) next.set('q', query); else next.delete('q');
      return next;
    }, { replace: true });
  };

  const selectedMember: SelectedMemberInfo | null = useMemo(() => {
    if (!selectedMemberParam || !selectedDayParam || !selectedDriverParam || !selectedTimeParam) return null;
    const dayPlan = Object.values(plan.dayPlans).find(
      dp => dp.dayOfWeekABCombo.uniqueNumber.toString() === selectedDayParam
    );
    if (!dayPlan) return null;
    const party = dayPlan.parties.find(
      p => p.driver === selectedDriverParam && p.time.toString() === selectedTimeParam
    );
    if (!party) return null;
    return { initials: selectedMemberParam, dayPlan, party };
  }, [plan, selectedMemberParam, selectedDayParam, selectedDriverParam, selectedTimeParam]);

  const setSelectedMember = (info: SelectedMemberInfo | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (info) {
        next.set('member', info.initials);
        next.set('day', info.dayPlan.dayOfWeekABCombo.uniqueNumber.toString());
        next.set('driver', info.party.driver);
        next.set('time', info.party.time.toString());
      } else {
        next.delete('member');
        next.delete('day');
        next.delete('driver');
        next.delete('time');
      }
      return next;
    }, { replace: true });
  };

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDayPlan, setEditingDayPlan] = useState<DayPlan | null>(null);
  const [customDaysMember, setCustomDaysMember] = useState<Member | null>(null);
  const [customDaysDialogOpen, setMemberDialogOpen] = useState(false);
  const [customDaysHighlightDay, setCustomDaysHighlightDay] = useState<DayOfWeekABCombo | null>(null);
  const [showDesignatedDriver, setShowDesignatedDriver] = useLocalStorage('carpool-show-designated-driver', false);
  const [showSoloDriver, setShowSoloDriver] = useLocalStorage('carpool-show-solo-driver', false);
  const { toast } = useToast();

  // Create lookup map: initials -> Member
  const membersByInitials = useMemo(() => buildMembersByInitials(members), [members]);

  // Format initials as "FirstName (Initials)" with non-breaking space
  const formatPerson = useCallback((initials: string) => {
    const member = membersByInitials.get(initials.toLowerCase());
    if (member) {
      return `${member.firstName}\u00A0(${member.initials})`;
    }
    return initials;
  }, [membersByInitials]);

  const openCustomDays = (initials: string, dayCombo?: DayOfWeekABCombo) => {
    const member = membersByInitials.get(initials.toLowerCase());
    if (!member) return;
    setCustomDaysMember(member);
    setCustomDaysHighlightDay(dayCombo ?? null);
    setMemberDialogOpen(true);
  };

  const handleSaveCustomDaysMember = (updated: Member) => {
    if (!customDaysMember) return;
    onMembersChange(members.map(m => m.initials === customDaysMember.initials ? updated : m));
  };

  const renderMemberInfoPane = () => {
    if (!selectedMember) return null;

    const member = membersByInitials.get(selectedMember.initials.toLowerCase());
    if (!member) return null;

    const dayCombo = selectedMember.dayPlan.dayOfWeekABCombo;
    const dayLabel = `${DAY_NAMES[dayCombo.dayOfWeek]}, Week ${dayCombo.isWeekA ? 'A' : 'B'}`;

    const timeInfo = selectedMember.party.schoolbound
      ? selectedMember.dayPlan.schoolboundTimeInfoByInitials?.[selectedMember.initials]
      : selectedMember.dayPlan.homeboundTimeInfoByInitials?.[selectedMember.initials];

    // Custom day preferences (keys are 0-based day indices, uniqueNumber is 1-based)
    const customDay = member.customDays?.[(dayCombo.uniqueNumber - 1).toString()];
    const prefLabels: string[] = [];
    if (customDay?.needsCar) prefLabels.push('designated driver');
    if (selectedMember.party.schoolbound ? customDay?.skipMorning : customDay?.skipAfternoon) prefLabels.push('solo driver');
    if (customDay?.drivingSkip) prefLabels.push('no car');
    if (customDay?.noWaitingAfternoon) prefLabels.push('no wait pm');

    // Determine which party member's own requirement (custom preference, or failing
    // that their plain timetable) is what's pushing the party's time earlier
    // (schoolbound) / later (homebound) than the driver's own timetable would.
    const timeInfoByInitials = selectedMember.party.schoolbound
      ? selectedMember.dayPlan.schoolboundTimeInfoByInitials
      : selectedMember.dayPlan.homeboundTimeInfoByInitials;
    const causesEarlierOrLater = (initials: string): boolean => {
      const partyTime = selectedMember.party.time;
      const driverInfo = timeInfoByInitials?.[selectedMember.party.driver];
      if (!driverInfo || driverInfo.timetableTime == null) return false;

      const deviatesFromDriverDefault = selectedMember.party.schoolbound
        ? partyTime < driverInfo.timetableTime
        : partyTime > driverInfo.timetableTime;
      if (!deviatesFromDriverDefault) return false;

      const info = timeInfoByInitials?.[initials];
      const personalRequiredTime = info?.customPrefTime ?? info?.timetableTime;
      return personalRequiredTime === partyTime;
    };

    const renderPartyPerson = (initials: string, bold: boolean) => (
      <button
        key={initials}
        onClick={() => setSelectedMember({ initials, dayPlan: selectedMember.dayPlan, party: selectedMember.party })}
        className={cn(
          "cursor-pointer transition-colors hover:text-primary hover:underline",
          bold && "font-bold",
          selectedMember.initials === initials && "text-primary underline"
        )}
        title={causesEarlierOrLater(initials) ? `Makes this party leave ${selectedMember.party.schoolbound ? 'earlier' : 'later'}` : undefined}
      >
        {causesEarlierOrLater(initials) && '* '}
        {formatPerson(initials)}
      </button>
    );

    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Member Details</p>
            <p className="text-lg font-semibold">
              <button
                onClick={() => openCustomDays(member.initials, dayCombo)}
                className="hover:text-primary hover:underline transition-colors"
                title="Timetable"
              >
                {member.firstName} {member.lastName}
              </button>
              <span className="text-muted-foreground ml-2">({member.initials})</span>
              {prefLabels.length > 0 && (
                <span className="text-sm text-muted-foreground font-normal ml-2">
                  ({prefLabels.join(', ')})
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setSelectedMember(null)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium">Day:</span> {dayLabel}
          </p>

          <div className="space-y-1">
            <p className="font-medium">Time Source Information</p>
            <div className="pl-3 space-y-1 text-sm">
              {timeInfo?.timetableTime !== null && (
                <p className="text-muted-foreground">
                  <span className="font-medium">Timetable:</span>{' '}
                  {formatTime(timeInfo?.timetableTime || 0)}h
                </p>
              )}
              {timeInfo?.customPrefTime !== null && (
                <p className={cn(
                  "font-medium",
                  timeInfo?.customPrefTime === timeInfo?.effectiveTime
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
                )}>
                  Custom Preference: {formatTime(timeInfo?.customPrefTime || 0)}h
                  {timeInfo?.customPrefTime === timeInfo?.effectiveTime && (
                    <span className="ml-2 text-xs">(Used - overrides timetable)</span>
                  )}
                </p>
              )}
              <p className="font-medium">
                Effective Time: {formatTime(timeInfo?.effectiveTime || 0)}h
              </p>
            </div>
          </div>

          <div className="space-y-1 pt-2">
            <p className="font-medium">Party</p>
            <p className="text-muted-foreground pl-3">
              [{formatTime(selectedMember.party.time)}] {renderPartyPerson(selectedMember.party.driver, true)}
              {selectedMember.party.passengers.length > 0 && (
                <>
                  {' · '}
                  {selectedMember.party.passengers.map((initials, idx) => (
                    <span key={initials}>
                      {idx > 0 && ' · '}
                      {renderPartyPerson(initials, false)}
                    </span>
                  ))}
                </>
              )}
            </p>
            {selectedMember.party.creationPhase && (
              <p className="text-xs text-muted-foreground pl-3">
                Created in {formatCreationPhase(selectedMember.party.creationPhase)}
              </p>
            )}
          </div>

          {/* {selectedMember.party.poolName && (
            <div className="space-y-1 pt-2">
              <p className="font-medium">Pool</p>
              <p className="text-muted-foreground pl-3 font-mono text-xs bg-muted/50 p-2 rounded">
                {selectedMember.party.poolName}
              </p>
            </div>
          )} */}
        </div>
      </div>
    );
  };

  const filteredDayPlans = useMemo(() => {
    return Object.entries(plan.dayPlans)
      .filter(([_, dayPlan]) => {
        if (weekFilter === 'A' && !dayPlan.dayOfWeekABCombo.isWeekA) return false;
        if (weekFilter === 'B' && dayPlan.dayOfWeekABCombo.isWeekA) return false;
        
        if (personFilter.trim()) {
          const query = personFilter.trim().toLowerCase();
          const hasPersonInParties = dayPlan.parties.some(party => {
            // Check driver by initials or name
            const driverMember = membersByInitials.get(party.driver.toLowerCase());
            const driverMatches = party.driver.toLowerCase().includes(query) ||
              (driverMember && (
                driverMember.firstName.toLowerCase().includes(query) ||
                driverMember.lastName.toLowerCase().includes(query)
              ));
            
            // Check passengers by initials or name
            const passengerMatches = party.passengers.some(p => {
              const passengerMember = membersByInitials.get(p.toLowerCase());
              return p.toLowerCase().includes(query) ||
                (passengerMember && (
                  passengerMember.firstName.toLowerCase().includes(query) ||
                  passengerMember.lastName.toLowerCase().includes(query)
                ));
            });
            
            return driverMatches || passengerMatches;
          });
          if (!hasPersonInParties) return false;
        }
        
        return true;
      })
      .sort(([a], [b]) => parseInt(a) - parseInt(b));
  }, [plan, weekFilter, personFilter, membersByInitials]);

  const handleEditDay = (dayPlan: DayPlan) => {
    setEditingDayPlan(dayPlan);
    setEditDialogOpen(true);
  };

  const handleExportPlan = () => {
    const dateStr = referenceDate ? format(referenceDate, 'yyyy-MM-dd') : '';
    downloadJson(dateStr ? `driving-plan-${dateStr}.json` : 'driving-plan.json', plan);
    toast({ title: 'Exported', description: 'Driving plan exported to JSON.' });
  };

  const handleExportPng = async () => {
    toast({ title: 'Preparing PNGs', description: 'This can take a few seconds…' });
    try {
      const darkMode = JSON.parse(window.localStorage.getItem('carpool-theme-dark') || 'false');
      const backendHostAndPort = getBackendUrl();
      const response = await fetch(`${backendHostAndPort}/api/v1/export/png`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members,
          plan,
          referenceDate: referenceDate ? format(referenceDate, 'yyyy-MM-dd') : null,
          showDesignatedDriver,
          showSoloDriver,
          darkMode,
        }),
      });
      if (!response.ok) throw new Error(`Export request failed with status ${response.status}`);
      const blob = await response.blob();

      // Both weeks are bundled into a single ZIP (rather than downloaded as
      // two separate files) because browsers throttle/drop automatically
      // triggered downloads fired back-to-back without a fresh user gesture.
      const weekAMonday = referenceDate ? format(getWeekMonday(referenceDate, true), 'yyyy-MM-dd') : '';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = weekAMonday ? `driving-plan-${weekAMonday}.zip` : 'driving-plan.zip';
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Exported', description: 'Week A and Week B saved as a ZIP of PNGs.' });
    } catch (err) {
      console.error('Failed to export plan as PNG:', err);
      toast({ title: 'Export failed', description: 'Could not generate the PNGs.', variant: 'destructive' });
    }
  };

  const handleDiscardPlan = () => {
    onPlanChange(null);
  };

  const handleApplyTransfers = (dayPlan: DayPlan, transfers: Transfer[]) => {
    if (!canApplyTransfers(dayPlan, transfers, members)) return;
    onPlanChange(applyTransfers(plan, dayPlan.dayOfWeekABCombo.uniqueNumber, transfers));
  };

  const renderPartyLine = (party: Party, dayPlan: DayPlan, dayKey: string, filterQuery: string, isLast: boolean) => {
    const isModified = modifiedPartyKeys?.has(partyKey(dayKey, party)) ?? false;
    const query = filterQuery.trim().toLowerCase();
    const driverMember = membersByInitials.get(party.driver.toLowerCase());
    const isDriverHighlighted = query && (
      party.driver.toLowerCase().includes(query) ||
      (driverMember && (
        driverMember.firstName.toLowerCase().includes(query) ||
        driverMember.lastName.toLowerCase().includes(query)
      ))
    );
    const isDriverSelected = selectedMember?.initials === party.driver && selectedMember?.party === party;
    
    const passengersFormatted = party.passengers.map(p => {
      const member = membersByInitials.get(p.toLowerCase());
      const isPassengerHighlighted = query && (
        p.toLowerCase().includes(query) ||
        (member && (
          member.firstName.toLowerCase().includes(query) ||
          member.lastName.toLowerCase().includes(query)
        ))
      );
      const displayText = member ? `${member.firstName}\u00A0(${member.initials})` : p;
      const isPassengerSelected = selectedMember?.initials === p && selectedMember?.party === party;
      
      return {
        text: displayText,
        initials: p,
        highlighted: isPassengerHighlighted,
        selected: isPassengerSelected
      };
    });

    return (
      <div key={`${party.driver}-${party.time}`} className={cn(
        "text-sm leading-tight py-0.5 pl-[7ch] transition-colors duration-700 rounded-sm",
        !isLast && "border-b border-border/30",
        isModified && "bg-warning/15"
      )} style={{ textIndent: '-7ch' }} title={isModified ? 'Recently modified' : undefined}>
        <span className="text-muted-foreground font-mono">[{formatTime(party.time)}]</span>
        {' '}
        <button
          onClick={() => setSelectedMember({ initials: party.driver, dayPlan, party })}
          className={cn(
            "font-semibold cursor-pointer transition-all",
            isDriverHighlighted && "text-primary",
            isDriverSelected && "text-primary font-bold underline",
            "hover:text-primary hover:font-bold"
          )}
        >
          {party.isLonelyDriver ? (
            showSoloDriver && <UserRoundX className="inline h-3.5 w-3.5 mb-0.5 mr-1 text-muted-foreground" />
          ) : party.isDesignatedDriver ? (
            showDesignatedDriver && <Flag className="inline h-3.5 w-3.5 mb-0.5 mr-1 text-muted-foreground" />
          ) : null}
          {formatPerson(party.driver)}
        </button>
        {passengersFormatted.length > 0 && (
          <span className="text-muted-foreground">
            {' · '}
            {passengersFormatted.map((p, idx) => (
              <span key={idx}>
                {idx > 0 && ' · '}
                <button
                  onClick={() => setSelectedMember({ initials: p.initials, dayPlan, party })}
                  className={cn(
                    "cursor-pointer transition-all",
                    p.highlighted && "text-primary font-semibold",
                    p.selected && "text-primary font-bold underline",
                    "hover:text-primary hover:font-bold"
                  )}
                >
                  {p.text}
                </button>
              </span>
            ))}
          </span>
        )}
      </div>
    );
  };

  const renderDayRow = ([dayKey, dayPlan]: [string, DayPlan]) => {
    const { dayOfWeekABCombo, parties } = dayPlan;
    const schoolboundParties = parties
      .filter(p => p.schoolbound === true)
      .sort((a, b) => a.time - b.time);
    const homeboundParties = parties
      .filter(p => p.schoolbound === false)
      .sort((a, b) => a.time - b.time);
    
    // Check if selected member belongs to this day
    const isSelectedDayPlan = selectedMember?.dayPlan.dayOfWeekABCombo.uniqueNumber === dayPlan.dayOfWeekABCombo.uniqueNumber;
    
    return (
      <>
        <tr key={dayKey} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
        <td className="py-1.5 px-4 align-top whitespace-nowrap font-medium">
          <div>
            {DAY_NAMES[dayOfWeekABCombo.dayOfWeek]}
          </div>
          <div className="text-xs text-muted-foreground">
            ({dayOfWeekABCombo.isWeekA ? 'A' : 'B'})
          </div>
        </td>
        <td className="py-1.5 px-4 align-top">
          {schoolboundParties.length > 0 ? (
            <div>
              {schoolboundParties.map((party, idx) => renderPartyLine(party, dayPlan, dayKey, personFilter, idx === schoolboundParties.length - 1))}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>
        <td className="py-1.5 px-4 align-top">
          {homeboundParties.length > 0 ? (
            <div>
              {homeboundParties.map((party, idx) => renderPartyLine(party, dayPlan, dayKey, personFilter, idx === homeboundParties.length - 1))}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>
        <td className="py-1.5 px-2 align-top">
          <button 
            onClick={() => handleEditDay(dayPlan)}
            className="p-1.5 rounded hover:bg-muted transition-all text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
            title="Edit day plan"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </td>
      </tr>
      {isSelectedDayPlan && selectedMember && (
        <tr key={`info-${dayKey}`}>
          <td colSpan={4} className="bg-primary/5 border-b border-border/50 p-4">
            {renderMemberInfoPane()}
          </td>
        </tr>
      )}
      </>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Tabs value={weekFilter} onValueChange={(v) => setWeekFilter(v as typeof weekFilter)}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList className="h-9">
            <TabsTrigger value="summary" className="text-sm px-4 gap-2">
              <FileText className="h-4 w-4" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="A" className="text-sm px-4">Week A</TabsTrigger>
            <TabsTrigger value="B" className="text-sm px-4">Week B</TabsTrigger>
            <TabsTrigger value="all" className="text-sm px-4">Complete Plan</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {weekFilter !== 'summary' && (
              <div className="relative w-full sm:w-56">
                <Input
                  placeholder="filter by name or initials"
                  value={personFilter}
                  onChange={(e) => setPersonFilter(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setPersonFilter(''); }}
                  className="h-9 text-sm pl-3 pr-3"
                />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleExportPlan} className="h-9" title="Export JSON">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPng} className="h-9" title="Export Week A / Week B as PNG">
              <Image className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleDiscardPlan} className="h-9" title="Discard Plan">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="summary" className="mt-4">
          {(() => {
            // Parse summary text: "- Name (Initials): Count"
            const lines = plan.summary.split('\n').filter(line => line.trim());
            const driveCounts = new Map<number, Array<{ name: string; initials: string }>>();
            
            lines.forEach(line => {
              const match = line.match(/^-\s*(.+?)\s*\(([^)]+)\):\s*(\d+)$/);
              if (match) {
                const [, name, initials, countStr] = match;
                const count = parseInt(countStr, 10);
                if (!driveCounts.has(count)) {
                  driveCounts.set(count, []);
                }
                driveCounts.get(count)!.push({ name: name.trim(), initials: initials.trim() });
              }
            });

            // Sort by count descending, and alphabetically by name within each count
            const sortedCounts = Array.from(driveCounts.entries())
              .sort((a, b) => b[0] - a[0])
              .map(([count, people]) => [
                count,
                people.sort((a, b) => a.name.localeCompare(b.name))
              ] as [number, Array<{ name: string; initials: string }>]);

            return (
              <div className="rounded-lg border border-border overflow-hidden">
                {sortedCounts.map(([count, people], idx) => (
                  <div 
                    key={count} 
                    className={cn(
                      "bg-card",
                      idx !== sortedCounts.length - 1 && "border-b border-border"
                    )}
                  >
                    <div className="bg-muted/50 px-4 py-2 border-b border-border/50">
                      <h3 className="text-sm font-semibold text-foreground">
                        Driving {count} {count === 1 ? 'time' : 'times'}
                      </h3>
                    </div>
                    <div className="px-4 py-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {people.map((person) => {
                          const member = membersByInitials.get(person.initials.toLowerCase());
                          return (
                            <button
                              key={person.initials}
                              onClick={() => openCustomDays(person.initials)}
                              className="text-sm text-muted-foreground hover:font-bold cursor-pointer transition-all text-left inline-flex items-center gap-1"
                              title="Timetable"
                            >
                              <span>
                                {person.name}
                                <span className="ml-1">({person.initials})</span>
                              </span>
                              {member?.isPartTime && (
                                <Clock className="h-3 w-3 text-muted-foreground/60 shrink-0" aria-label="Part-time" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        {['A', 'B', 'all'].map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="mt-4 space-y-4">
            {/* Table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="py-2 px-4 text-left text-sm font-semibold text-foreground w-28">Day</th>
                    <th className="py-2 px-4 text-left text-sm font-semibold text-foreground">Schoolbound</th>
                    <th className="py-2 px-4 text-left text-sm font-semibold text-foreground">Homebound</th>
                    <th className="py-2 px-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDayPlans.map(([dayKey, dayPlan], idx) => {
                    const needsSeparator = dayPlan.dayOfWeekABCombo.dayOfWeek === 'MONDAY';

                    return (
                      <>
                        {needsSeparator && (
                          <tr key={`separator-${dayKey}`}>
                            <td colSpan={4} className="py-0">
                              <WeekSeparator isWeekA={dayPlan.dayOfWeekABCombo.isWeekA} referenceDate={referenceDate} />
                            </td>
                          </tr>
                        )}
                        {renderDayRow([dayKey, dayPlan])}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredDayPlans.length === 0 && (
              <div className="text-center py-12 border border-border rounded-lg">
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No day plans match your filters</p>
              </div>
            )}

            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <button
                onClick={() => setShowDesignatedDriver(v => !v)}
                className={cn(
                  "flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-100",
                  !showDesignatedDriver && "opacity-40"
                )}
                title={showDesignatedDriver ? "Hide designated driver indicator" : "Show designated driver indicator"}
              >
                <Flag className="h-3.5 w-3.5" /> designated driver
              </button>
              <button
                onClick={() => setShowSoloDriver(v => !v)}
                className={cn(
                  "flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-100",
                  !showSoloDriver && "opacity-40"
                )}
                title={showSoloDriver ? "Hide solo driver indicator" : "Show solo driver indicator"}
              >
                <UserRoundX className="h-3.5 w-3.5" /> solo driver (no passengers)
              </button>
              {modifiedPartyKeys && modifiedPartyKeys.size > 0 && (
                <button
                  onClick={onClearHighlights}
                  className="flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-100"
                  title="Clear modification highlights"
                >
                  <X className="h-3.5 w-3.5" /> clear modification highlights
                </button>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <DayPlanEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        dayPlan={editingDayPlan}
        onApplyTransfers={handleApplyTransfers}
        members={members}
      />

      <MemberDialog
        open={customDaysDialogOpen}
        onOpenChange={setMemberDialogOpen}
        member={customDaysMember}
        onSave={handleSaveCustomDaysMember}
        initialTab="timetable"
        referenceDate={referenceDate}
        initialTimetableDay={customDaysHighlightDay ?? undefined}
      />
    </div>
  );
}
