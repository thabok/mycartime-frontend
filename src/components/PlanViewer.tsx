import { useState, useMemo } from 'react';
import { DrivingPlan, DayPlan, Party } from '@/types/carpool';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Car, 
  Users, 
  Sun, 
  Sunset, 
  Search,
  ArrowRight,
  Clock
} from 'lucide-react';
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
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

export function PlanViewer({ plan, onPlanChange }: PlanViewerProps) {
  const [weekFilter, setWeekFilter] = useState<'all' | 'A' | 'B'>('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const allInitials = useMemo(() => {
    const initials = new Set<string>();
    Object.values(plan.dayPlans).forEach(dayPlan => {
      dayPlan.parties.forEach(party => {
        initials.add(party.driver);
        party.passengers.forEach(p => initials.add(p));
      });
    });
    return Array.from(initials).sort();
  }, [plan]);

  const filteredDayPlans = useMemo(() => {
    return Object.entries(plan.dayPlans)
      .filter(([_, dayPlan]) => {
        if (weekFilter === 'A' && !dayPlan.dayOfWeekABCombo.isWeekA) return false;
        if (weekFilter === 'B' && dayPlan.dayOfWeekABCombo.isWeekA) return false;
        
        if (personFilter && personFilter !== 'all') {
          const hasPersonInParties = dayPlan.parties.some(
            party => party.driver === personFilter || party.passengers.includes(personFilter)
          );
          if (!hasPersonInParties) return false;
        }
        
        return true;
      })
      .sort(([a], [b]) => parseInt(a) - parseInt(b));
  }, [plan, weekFilter, personFilter]);

  const renderParty = (party: Party, index: number) => {
    const isSchoolbound = party.direction === 'SCHOOLBOUND';
    
    return (
      <div 
        key={`${party.driver}-${party.direction}-${index}`}
        className={cn(
          "p-3 rounded-lg border transition-colors",
          isSchoolbound 
            ? "bg-accent/30 border-accent" 
            : "bg-warning/10 border-warning/30"
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          {isSchoolbound ? (
            <Sun className="h-4 w-4 text-accent-foreground" />
          ) : (
            <Sunset className="h-4 w-4 text-warning" />
          )}
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isSchoolbound ? 'To School' : 'Homebound'}
          </span>
          <Badge variant="outline" className="ml-auto text-xs">
            <Clock className="h-3 w-3 mr-1" />
            {formatTime(party.departureTime)}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Car className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{party.driver}</span>
          </div>
          
          {party.passengers.length > 0 && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <div className="flex items-center gap-1 flex-wrap">
                {party.passengers.map(passenger => (
                  <Badge key={passenger} variant="secondary" className="text-xs">
                    {passenger}
                  </Badge>
                ))}
              </div>
            </>
          )}
          
          {party.passengers.length === 0 && (
            <span className="text-xs text-muted-foreground ml-2">Solo</span>
          )}
        </div>
      </div>
    );
  };

  const renderDayPlan = ([dayKey, dayPlan]: [string, DayPlan]) => {
    const { dayOfWeekABCombo, parties } = dayPlan;
    const schoolboundParties = parties.filter(p => p.direction === 'SCHOOLBOUND');
    const homeboundParties = parties.filter(p => p.direction === 'HOMEBOUND');
    
    return (
      <Card key={dayKey} className="surface-elevated animate-slide-up">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {DAY_NAMES[dayOfWeekABCombo.dayOfWeek]}
              <Badge variant={dayOfWeekABCombo.isWeekA ? 'default' : 'secondary'}>
                Week {dayOfWeekABCombo.isWeekA ? 'A' : 'B'}
              </Badge>
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Day {dayOfWeekABCombo.uniqueNumber + 1}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {schoolboundParties.length > 0 && (
            <div className="space-y-2">
              {schoolboundParties.map((party, i) => renderParty(party, i))}
            </div>
          )}
          
          {homeboundParties.length > 0 && (
            <div className="space-y-2">
              {homeboundParties.map((party, i) => renderParty(party, i))}
            </div>
          )}
          
          {parties.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No carpool parties scheduled
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary */}
      <Card className="surface-elevated border-primary/20">
        <CardContent className="py-4">
          <p className="text-foreground font-medium">{plan.summary}</p>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Tabs value={weekFilter} onValueChange={(v) => setWeekFilter(v as typeof weekFilter)} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all">All Days</TabsTrigger>
            <TabsTrigger value="A">Week A</TabsTrigger>
            <TabsTrigger value="B">Week B</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={personFilter} onValueChange={setPersonFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by person" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All people</SelectItem>
            {allInitials.map(initials => (
              <SelectItem key={initials} value={initials}>{initials}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Day Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredDayPlans.map(renderDayPlan)}
      </div>

      {filteredDayPlans.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No day plans match your filters</p>
        </div>
      )}
    </div>
  );
}
