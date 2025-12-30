import { useState, useMemo } from 'react';
import { DrivingPlan, DayPlan, Party } from '@/types/carpool';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanViewerProps {
  plan: DrivingPlan;
  onPlanChange: (plan: DrivingPlan) => void;
}

const DAY_NAMES: Record<string, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
};

const formatTime = (time: number): string => {
  const hours = Math.floor(time / 100);
  const minutes = time % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}h`;
};

export function PlanViewer({ plan, onPlanChange }: PlanViewerProps) {
  const [weekFilter, setWeekFilter] = useState<'all' | 'A' | 'B'>('all');
  const [personFilter, setPersonFilter] = useState('');

  const filteredDayPlans = useMemo(() => {
    return Object.entries(plan.dayPlans)
      .filter(([_, dayPlan]) => {
        if (weekFilter === 'A' && !dayPlan.dayOfWeekABCombo.isWeekA) return false;
        if (weekFilter === 'B' && dayPlan.dayOfWeekABCombo.isWeekA) return false;
        
        if (personFilter.trim()) {
          const query = personFilter.trim().toLowerCase();
          const hasPersonInParties = dayPlan.parties.some(
            party => 
              party.driver.toLowerCase().includes(query) || 
              party.passengers.some(p => p.toLowerCase().includes(query))
          );
          if (!hasPersonInParties) return false;
        }
        
        return true;
      })
      .sort(([a], [b]) => parseInt(a) - parseInt(b));
  }, [plan, weekFilter, personFilter]);

  const renderPartyLine = (party: Party, filterQuery: string) => {
    const query = filterQuery.trim().toLowerCase();
    const isDriverHighlighted = query && party.driver.toLowerCase().includes(query);
    const driverPrefix = isDriverHighlighted ? '*' : '';
    
    const passengersText = party.passengers.length > 0 
      ? ' - ' + party.passengers.join(' - ')
      : '';

    return (
      <li key={`${party.driver}-${party.departureTime}`} className="text-sm leading-relaxed">
        <span className="text-muted-foreground">[{formatTime(party.departureTime)}]</span>
        {' '}
        <span className={cn("font-semibold", isDriverHighlighted && "text-primary")}>
          {driverPrefix}{party.driver}
        </span>
        {passengersText && (
          <span className="text-muted-foreground">{passengersText}</span>
        )}
      </li>
    );
  };

  const renderDayRow = ([dayKey, dayPlan]: [string, DayPlan]) => {
    const { dayOfWeekABCombo, parties } = dayPlan;
    const schoolboundParties = parties
      .filter(p => p.direction === 'SCHOOLBOUND')
      .sort((a, b) => a.departureTime - b.departureTime);
    const homeboundParties = parties
      .filter(p => p.direction === 'HOMEBOUND')
      .sort((a, b) => a.departureTime - b.departureTime);
    
    return (
      <tr key={dayKey} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
        <td className="py-3 px-4 align-top whitespace-nowrap font-medium">
          <div>
            {DAY_NAMES[dayOfWeekABCombo.dayOfWeek]}
          </div>
          <div className="text-xs text-muted-foreground">
            ({dayOfWeekABCombo.isWeekA ? 'A' : 'B'})
          </div>
        </td>
        <td className="py-3 px-4 align-top">
          {schoolboundParties.length > 0 ? (
            <ul className="list-disc list-inside space-y-0.5">
              {schoolboundParties.map(party => renderPartyLine(party, personFilter))}
            </ul>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>
        <td className="py-3 px-4 align-top">
          {homeboundParties.length > 0 ? (
            <ul className="list-disc list-inside space-y-0.5">
              {homeboundParties.map(party => renderPartyLine(party, personFilter))}
            </ul>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>
        <td className="py-3 px-2 align-top">
          <button 
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Edit day plan"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary */}
      <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
        <p className="text-sm text-foreground">{plan.summary}</p>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Tabs value={weekFilter} onValueChange={(v) => setWeekFilter(v as typeof weekFilter)}>
          <TabsList className="h-9">
            <TabsTrigger value="A" className="text-sm px-4">Week A</TabsTrigger>
            <TabsTrigger value="B" className="text-sm px-4">Week B</TabsTrigger>
            <TabsTrigger value="all" className="text-sm px-4">Complete Plan</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-48">
          <Input
            placeholder="filter by initials"
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="h-9 text-sm pl-3 pr-3"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="py-2.5 px-4 text-left text-sm font-semibold text-foreground w-28">Day</th>
              <th className="py-2.5 px-4 text-left text-sm font-semibold text-foreground">Schoolbound</th>
              <th className="py-2.5 px-4 text-left text-sm font-semibold text-foreground">Homebound</th>
              <th className="py-2.5 px-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredDayPlans.map(renderDayRow)}
          </tbody>
        </table>
      </div>

      {filteredDayPlans.length === 0 && (
        <div className="text-center py-12 border border-border rounded-lg">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No day plans match your filters</p>
        </div>
      )}
    </div>
  );
}
