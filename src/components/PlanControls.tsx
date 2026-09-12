import { useCallback, useRef, useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Member, DrivingPlan } from '@/types/carpool';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  CalendarIcon, 
  Loader2, 
  Sparkles, 
  Upload, 
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBackendUrl } from '@/lib/config';
import { useToast } from '@/hooks/use-toast';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useWebuntisCredentials } from '@/hooks/useWebuntisCredentials';
import { refreshTimetableCache } from '@/lib/timetableCache';
import { useSpinnerVerbs } from '@/hooks/useSpinnerVerbs';
import { PlanGenerationDialog } from '@/components/PlanGenerationDialog';
import { PlanGenerationState, PlanStreamEvent } from '@/types/planGeneration';

const IDLE_GENERATION_STATE: PlanGenerationState = {
  phaseMessage: 'Starting up',
  metrics: null,
  stats: null,
  stopping: false,
  noImprovementSeconds: null,
};

interface PlanControlsProps {
  members: Member[];
  plan: DrivingPlan | null;
  onPlanChange: (plan: DrivingPlan | null) => void;
  onViewPlan: () => void;
  onReferenceDateChange?: (date: Date | undefined) => void;
}

export function PlanControls({ members, plan, onPlanChange, onViewPlan, onReferenceDateChange }: PlanControlsProps) {
  const { username, setUsername, password, setPassword, hasCredentials, hasStoredPassword, credentialFields } = useWebuntisCredentials();
  const [referenceDateString, setReferenceDateString] = useLocalStorage<string | null>('carpool-reference-date', null);
  const [referenceDate, setReferenceDate] = useState<Date | undefined>(() => {
    if (referenceDateString) {
      try {
        return parseISO(referenceDateString);
      } catch {
        return undefined;
      }
    }
    return undefined;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoStopEnabled, setAutoStopEnabled] = useLocalStorage<boolean>('carpool-auto-stop', false);
  const [generation, setGeneration] = useState<PlanGenerationState>(IDLE_GENERATION_STATE);
  const jobIdRef = useRef<string | null>(null);
  const { statusMessage, pickStatusMessage } = useSpinnerVerbs();
  const { toast } = useToast();
  const backendHostAndPort = getBackendUrl();

  // Sync referenceDate state to localStorage whenever it changes
  useEffect(() => {
    if (referenceDate) {
      setReferenceDateString(format(referenceDate, 'yyyy-MM-dd'));
    } else {
      setReferenceDateString(null);
    }
    onReferenceDateChange?.(referenceDate);
  }, [referenceDate, setReferenceDateString, onReferenceDateChange]);

  // Auto-suggest a reference date (next date that falls in an A week) once
  // credentials are available, unless the user already has one set/saved.
  // Debounced so it doesn't fire on every keystroke, and retries whenever
  // the credentials change again (e.g. after fixing a typo) rather than
  // giving up permanently after one failed attempt.
  useEffect(() => {
    if (referenceDateString) return;
    if (!hasCredentials) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${backendHostAndPort}/api/v1/suggestedreferencedate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...credentialFields }),
        });
        if (cancelled || !response.ok) return;
        const { referenceDate: suggested } = await response.json() as { referenceDate: string };
        if (cancelled) return;
        setReferenceDate(parseISO(
          `${suggested.slice(0, 4)}-${suggested.slice(4, 6)}-${suggested.slice(6, 8)}`
        ));
      } catch {
        // Best-effort suggestion; the user can always pick a date manually.
      }
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, password, hasCredentials, referenceDateString, backendHostAndPort]);

  const isDateValid = !!referenceDate;
  const canGenerate = hasCredentials && isDateValid && members.length > 0 && !plan;

  const formatDateForApi = (date: Date): number => {
    const yyyy = date.getFullYear().toString();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    return parseInt(`${yyyy}${mm}${dd}`);
  };

  const handleStopGeneration = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    setGeneration(prev => ({ ...prev, stopping: true, phaseMessage: 'Wrapping up the best plan so far' }));
    try {
      await fetch(`${backendHostAndPort}/api/v1/drivingplan/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
    } catch (error) {
      // The job may have finished on its own between render and click; the
      // stream will deliver the plan either way, so there is nothing to do.
      console.error('Failed to stop plan generation:', error);
    }
  }, [backendHostAndPort]);

  const handleGenerate = async () => {
    if (!canGenerate || !referenceDate) return;

    setIsGenerating(true);
    setGeneration(IDLE_GENERATION_STATE);
    jobIdRef.current = null;
    pickStatusMessage();

    try {
      const payload = {
        persons: members,
        scheduleReferenceStartDate: formatDateForApi(referenceDate),
        ...credentialFields,
      };

      // Streaming endpoint rather than /api/v1/drivingplan: the solver can run for
      // minutes, so the UI follows its progress and can ask it to stop early.
      const response = await fetch(`${backendHostAndPort}/api/v1/drivingplan/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server responded with ${response.status}`);
      }

      let generatedPlan: DrivingPlan | null = null;
      let solveStatus: PlanGenerationState['stats'] = null;
      let streamError: string | null = null;

      const handleEvent = (event: PlanStreamEvent) => {
        switch (event.type) {
          case 'job':
            jobIdRef.current = event.jobId;
            setGeneration(prev => ({
              ...prev,
              noImprovementSeconds: event.noImprovementSeconds,
            }));
            break;
          case 'status':
            setGeneration(prev => ({ ...prev, phaseMessage: event.message }));
            break;
          case 'progress':
            setGeneration(prev => ({ ...prev, metrics: event.metrics }));
            break;
          case 'solved':
            solveStatus = event.stats;
            setGeneration(prev => ({
              ...prev,
              stats: event.stats,
              phaseMessage: 'Building the plan',
            }));
            break;
          case 'final':
            generatedPlan = event.plan;
            break;
          case 'error':
            streamError = event.message;
            break;
          case 'heartbeat':
            break;
        }
      };

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) handleEvent(JSON.parse(line) as PlanStreamEvent);
        }
      }
      if (buffer.trim()) handleEvent(JSON.parse(buffer) as PlanStreamEvent);

      if (streamError) throw new Error(streamError);
      if (!generatedPlan) throw new Error('The server finished without returning a plan.');

      onPlanChange(generatedPlan);
      onViewPlan();
      toast({
        title: 'Plan generated!',
        description: solveStatus?.provenOptimal
          ? 'This is the best possible plan for these schedules.'
          : 'Your driving plan has been created successfully.',
      });

      // Best-effort: refresh the per-member timetable detail cache now, while
      // the credentials are on hand, so the Timetable tab in Member details
      // can be viewed later without logging in again.
      refreshTimetableCache(members, referenceDate, credentialFields).catch((err) => {
        console.error('Failed to refresh timetable cache:', err);
      });
    } catch (error) {
      console.error('Failed to generate plan:', error);
      toast({
        title: 'Generation failed',
        description: error instanceof Error && error.message
          ? error.message
          : 'Could not connect to the backend service. Please check if it\'s running.',
        variant: 'destructive'
      });
    } finally {
      jobIdRef.current = null;
      setIsGenerating(false);
      setGeneration(IDLE_GENERATION_STATE);
    }
  };

  const handleImportPlan = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (Array.isArray(imported)) {
          throw new Error('This looks like a members file, not a driving plan file.');
        }
        if (!imported.summary || !imported.dayPlans) throw new Error('Invalid format');
        onPlanChange(imported as DrivingPlan);
        onViewPlan();
        toast({ title: 'Plan loaded', description: 'Driving plan imported successfully.' });
      } catch (err) {
        const description = err instanceof Error && err.message.startsWith('This looks like')
          ? err.message
          : 'The file could not be parsed. Please check the format.';
        toast({
          title: 'Import failed',
          description,
          variant: 'destructive'
        });
      }
    };
    input.click();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PlanGenerationDialog
        open={isGenerating}
        state={generation}
        statusMessage={statusMessage}
        onRequestNewVerb={pickStatusMessage}
        onStop={handleStopGeneration}
        autoStopEnabled={autoStopEnabled}
        onAutoStopEnabledChange={setAutoStopEnabled}
      />

      {/* Authentication Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Schedule Access</CardTitle>
          </div>
          <CardDescription>
            {hasStoredPassword
              ? 'Using the WebUntis credentials saved in Settings. Type a password below to use different ones instead.'
              : 'Enter credentials to fetch teacher schedules from webuntis'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                disabled={!!plan}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={hasStoredPassword ? '•••••••• (saved)' : 'Password'}
                disabled={!!plan}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reference Date Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Reference Date</CardTitle>
          </div>
          <CardDescription>
            Marks the start of the current schedule and references week A.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !referenceDate && "text-muted-foreground"
                )}
                disabled={!!plan}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {referenceDate ? (
                  format(referenceDate, 'EEEE, MMMM d, yyyy')
                ) : (
                  <span>Pick a date...</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={referenceDate}
                onSelect={setReferenceDate}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-3">
        {!plan ? (
          <>
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className="w-full"
              variant="gradient"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Plan...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Driving Plan
                </>
              )}
            </Button>
            
            {!canGenerate && !isGenerating && (
              <p className="text-xs text-muted-foreground text-center">
                {!hasCredentials
                  ? 'Enter credentials above'
                  : !isDateValid 
                    ? 'Select a reference date'
                    : members.length === 0 
                      ? 'Add at least one member'
                      : 'A plan already exists'}
              </p>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button variant="outline" onClick={handleImportPlan} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Load Plan from JSON
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onViewPlan} className="w-full" size="lg">
              View Driving Plan
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
