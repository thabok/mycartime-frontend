import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Circle, GraduationCap, PartyPopper, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TUTORIAL_STEP_LABELS, TUTORIAL_STEPS, TutorialProgress, TutorialStep } from '@/lib/tutorial';

interface TutorialAssistantProps {
  progress: TutorialProgress;
  onCompleteStep: (step: TutorialStep) => void;
  onClose: () => void;
  onNavigate: (step: TutorialStep) => void;
  showNavigation: boolean;
}

const STEP_COPY: Record<TutorialStep, { title: string; description: string; action: string }> = {
  webuntis: {
    title: 'Connect WebUntis',
    description: 'Add your WebUntis server and account details in Settings so the planner can look up timetables.',
    action: 'Open Settings',
  },
  members: {
    title: 'Build your member roster',
    description: 'Add at least two carpool members, or import a saved roster from JSON.',
    action: 'Go to Members',
  },
  plan: {
    title: 'Create your first driving plan',
    description: 'Choose a reference date and generate a plan from your members’ WebUntis schedules.',
    action: 'Go to Driving Plan',
  },
  results: {
    title: 'Look through the results',
    description: 'Visit the Summary and then open Week A, Week B, or the Complete Plan to see the generated schedule.',
    action: 'View Summary',
  },
  manualChanges: {
    title: 'Try a manual change',
    description: 'Use the edit button on a day to adjust its parties and apply the change.',
    action: 'Open Driving Plan',
  },
  export: {
    title: 'Share the plan',
    description: 'Export the plan as PNG files and distribute them to your carpool group.',
    action: 'Open Driving Plan',
  },
  aiAssistant: {
    title: 'Optional: set up the AI Assistant',
    description: 'Open Settings to configure the AI Assistant. This step is optional, so you can mark it complete whenever you are ready.',
    action: 'Open AI Assistant Settings',
  },
};

export function TutorialAssistant({ progress, onCompleteStep, onClose, onNavigate, showNavigation }: TutorialAssistantProps) {
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [celebratingStep, setCelebratingStep] = useState<TutorialStep | null>(null);
  const [animatingSteps, setAnimatingSteps] = useState<Set<TutorialStep>>(new Set());
  const previousProgress = useRef(progress);
  const previousProgressForAnimation = useRef(progress);
  const manuallyCompletingStep = useRef<TutorialStep | null>(null);
  const completionTimer = useRef<number | null>(null);
  const animationTimers = useRef<number[]>([]);
  const currentStep = TUTORIAL_STEPS.find((step) => !progress[step]);
  const currentCopy = currentStep ? STEP_COPY[currentStep] : null;
  const essentialStepsComplete = TUTORIAL_STEPS
    .filter((step) => step !== 'aiAssistant')
    .every((step) => progress[step]);

  useEffect(() => {
    const newlyCompleted = TUTORIAL_STEPS.find((step) => progress[step] && !previousProgress.current[step]);
    previousProgress.current = progress;
    if (!newlyCompleted) return;

    setCelebratingStep(newlyCompleted);
    const timer = window.setTimeout(() => setCelebratingStep(null), 1400);
    return () => window.clearTimeout(timer);
  }, [progress]);

  const removeAnimation = useCallback((steps: TutorialStep[]) => {
    setAnimatingSteps((previous) => {
      const next = new Set(previous);
      steps.forEach((step) => next.delete(step));
      return next;
    });
  }, []);

  const animateCompletion = useCallback((steps: TutorialStep[], removeAfter = true) => {
    if (steps.length === 0) return;
    setAnimatingSteps((previous) => new Set([...previous, ...steps]));
    if (!removeAfter) return;

    const timer = window.setTimeout(() => {
      removeAnimation(steps);
      animationTimers.current = animationTimers.current.filter((id) => id !== timer);
    }, 1250);
    animationTimers.current.push(timer);
  }, [removeAnimation]);

  useLayoutEffect(() => {
    const newlyCompleted = TUTORIAL_STEPS.filter(
      (step) => progress[step] && !previousProgressForAnimation.current[step]
    );
    previousProgressForAnimation.current = progress;
    if (newlyCompleted.length === 0) return;

    const manuallyCompleted = manuallyCompletingStep.current;
    if (manuallyCompleted && newlyCompleted.includes(manuallyCompleted)) {
      manuallyCompletingStep.current = null;
      removeAnimation([manuallyCompleted]);
    }

    animateCompletion(newlyCompleted.filter((step) => step !== manuallyCompleted));
  }, [progress, animateCompletion, removeAnimation]);

  useEffect(() => () => {
    if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    animationTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const handleCompleteCurrentStep = () => {
    if (!currentStep || animatingSteps.size > 0) return;

    animateCompletion([currentStep], false);
    completionTimer.current = window.setTimeout(() => {
      manuallyCompletingStep.current = currentStep;
      onCompleteStep(currentStep);
      completionTimer.current = null;
    }, 1250);
  };

  const handleClose = () => {
    if (essentialStepsComplete) {
      onClose();
      return;
    }
    setCloseConfirmOpen(true);
  };

  return (
    <aside className="relative flex w-[360px] flex-shrink-0 flex-col overflow-hidden border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Tutorial</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose} aria-label="Close tutorial" title="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {currentStep && currentCopy ? (
            <>
              <div className="rounded-lg bg-muted p-3 text-sm">
                <h3 className="mb-1 font-medium">{currentCopy.title}</h3>
                <p className="text-muted-foreground">{currentCopy.description}</p>
              </div>
              {showNavigation && (
                <Button className="w-full" onClick={() => onNavigate(currentStep)}>
                  {currentCopy.action}
                </Button>
              )}
              <Button variant="outline" className="w-full" onClick={handleCompleteCurrentStep} disabled={animatingSteps.size > 0}>
                {animatingSteps.size > 0 ? 'Completing...' : 'Mark this step as completed'}
              </Button>
            </>
          ) : (
            <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
              You’ve completed the tutorial. Your carpool is ready to go.
            </div>
          )}
        </div>
      </ScrollArea>

      {celebratingStep && (
        <div className="relative h-10 px-4" aria-live="polite">
          <div key={celebratingStep} className="pointer-events-none absolute inset-x-0 bottom-1 z-20 flex justify-center">
            <div className="tutorial-celebration-message flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg">
              <PartyPopper className="h-4 w-4" />
              Nice work!
            </div>
            <div className="absolute bottom-3 left-1/2">
              {Array.from({ length: 12 }, (_, index) => (
                <span key={index} className="tutorial-confetti-piece" />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-border p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Your progress</p>
        <ol className="space-y-2">
          {TUTORIAL_STEPS.map((step) => {
            const completed = progress[step];
            const current = step === currentStep;
            const completing = animatingSteps.has(step);
            const label = TUTORIAL_STEP_LABELS[step];
            const visiblyCompleted = completed && !completing;
            return (
              <li key={step} className={cn('relative flex w-fit max-w-full gap-2 text-xs', visiblyCompleted ? 'text-muted-foreground' : 'text-foreground', current && 'font-medium')}>
                {visiblyCompleted ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                {completing ? (
                  <>
                    <span className="relative inline-block">
                      <span>{label}</span>
                      <span aria-hidden className="tutorial-step-completion-trail text-muted-foreground">{label}</span>
                    </span>
                    <span className="tutorial-step-rocket" aria-hidden>
                      🚀
                      {Array.from({ length: 6 }, (_, index) => <i key={index} className="tutorial-rocket-confetti-piece" />)}
                    </span>
                  </>
                ) : (
                  <span>{label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quit the tutorial?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to quit the tutorial?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue tutorial</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Quit tutorial</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
