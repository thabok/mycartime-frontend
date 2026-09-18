import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { Member, DrivingPlan, ViewMode } from '@/types/carpool';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useAssistant } from '@/hooks/useAssistant';
import { useAssistantAvailability } from '@/hooks/useAssistantAvailability';
import { diffModifiedPartyKeys } from '@/lib/planDiff';
import { getBackendUrl } from '@/lib/config';
import { Header } from '@/components/Header';
import { MembersPanel } from '@/components/MembersPanel';
import { PlanControls } from '@/components/PlanControls';
import { PlanViewer } from '@/components/PlanViewer';
import { AssistantFab } from '@/components/AssistantFab';
import { AssistantPanel } from '@/components/AssistantPanel';
import { TutorialAssistant } from '@/components/TutorialAssistant';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';
import { EMPTY_TUTORIAL_PROGRESS, TUTORIAL_STEPS, TutorialProgress, TutorialStep } from '@/lib/tutorial';

const Index = () => {
  const [members, setMembers] = useLocalStorage<Member[]>('carpool-members', []);
  const [plan, setPlan] = useLocalStorage<DrivingPlan | null>('carpool-plan', null);
  // Initialized from localStorage (rather than PlanControls' onReferenceDateChange
  // callback alone) so the date survives a page reload once a plan already exists
  // and PlanControls is no longer mounted to report it.
  const [referenceDate, setReferenceDate] = useState<Date | undefined>(() => {
    try {
      const stored = window.localStorage.getItem('carpool-reference-date');
      const dateString = stored ? JSON.parse(stored) as string | null : null;
      return dateString ? parseISO(dateString) : undefined;
    } catch {
      return undefined;
    }
  });
  const [modifiedPartyKeys, setModifiedPartyKeys] = useState<Set<string>>(new Set());
  const [tutorialProgress, setTutorialProgress] = useLocalStorage<TutorialProgress>('carpool-tutorial-progress', EMPTY_TUTORIAL_PROGRESS);
  const [tutorialOpen, setTutorialOpen] = useLocalStorage('carpool-tutorial-open', true);
  const [resultVisits, setResultVisits] = useLocalStorage('carpool-tutorial-result-visits', { summary: false, plan: false });
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [settingsRequest, setSettingsRequest] = useState<number>();
  const [webuntisConfigured, setWebuntisConfigured] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const viewMode: ViewMode = location.pathname.startsWith('/plan') ? 'plan' : 'members';
  const tutorialStep = TUTORIAL_STEPS.find((step) => !tutorialProgress[step]);
  const tab = new URLSearchParams(location.search).get('tab');
  const isSummary = !tab || tab === 'summary';
  const isPlanSchedule = tab === 'A' || tab === 'B' || tab === 'all';

  useEffect(() => {
    let cancelled = false;

    fetch(`${getBackendUrl()}/api/v1/settings`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load settings');
        return response.json() as Promise<{
          WEBUNTIS_SERVER?: string;
          WEBUNTIS_USERNAME?: string;
          WEBUNTIS_PASSWORD_SET?: boolean;
        }>;
      })
      .then((settings) => {
        if (cancelled) return;
        setWebuntisConfigured(Boolean(
          settings.WEBUNTIS_SERVER?.trim() &&
          settings.WEBUNTIS_USERNAME?.trim() &&
          settings.WEBUNTIS_PASSWORD_SET
        ));
      })
      .catch(() => {
        // Settings remain available through the tutorial's manual path if the
        // backend cannot be reached when the app first opens.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const completeTutorialStep = useCallback((step: TutorialStep) => {
    setTutorialProgress((previous) => previous[step] ? previous : { ...previous, [step]: true });
  }, [setTutorialProgress]);

  useEffect(() => {
    if (!plan || viewMode !== 'plan') return;
    if (isSummary && !resultVisits.summary) setResultVisits((previous) => ({ ...previous, summary: true }));
    if (isPlanSchedule && !resultVisits.plan) setResultVisits((previous) => ({ ...previous, plan: true }));
  }, [plan, viewMode, isSummary, isPlanSchedule, resultVisits, setResultVisits]);

  useEffect(() => {
    setTutorialProgress((previous) => {
      const next = { ...previous };
      if (webuntisConfigured) next.webuntis = true;
      if (members.length >= 2) next.members = true;
      if (plan) next.plan = true;
      if (resultVisits.summary && resultVisits.plan) next.results = true;
      return TUTORIAL_STEPS.every((step) => previous[step] === next[step]) ? previous : next;
    });
  }, [webuntisConfigured, members.length, plan, resultVisits, setTutorialProgress]);

  const handleViewModeChange = (mode: ViewMode) => {
    navigate(mode === 'plan' ? '/plan' : '/members');
  };

  const handleViewPlan = () => {
    navigate('/plan');
  };

  const navigateTutorial = (step: TutorialStep) => {
    switch (step) {
      case 'webuntis':
      case 'aiAssistant':
        setSettingsRequest((previous) => (previous ?? 0) + 1);
        break;
      case 'members':
        navigate('/members');
        break;
      case 'results':
        navigate('/plan');
        break;
      case 'manualChanges':
      case 'export':
        navigate('/plan?tab=A');
        break;
      case 'plan':
        navigate('/plan');
        break;
    }
  };

  const resetTutorial = () => {
    setTutorialProgress(EMPTY_TUTORIAL_PROGRESS);
    setResultVisits({ summary: false, plan: false });
    setTutorialOpen(true);
  };

  // Whenever the plan is replaced - whether via the Day Plan Editor, a direct
  // API call (generate/import), or the AI assistant - diff it against the
  // previous plan so the affected parties can be highlighted in the driving
  // plan view. The highlight persists until the next plan change, the user
  // clears it manually, or a full page reload since it only lives in
  // component state.
  const handlePlanChange = (newPlan: DrivingPlan | null) => {
    const changedKeys = newPlan ? diffModifiedPartyKeys(plan, newPlan) : new Set<string>();
    setModifiedPartyKeys(changedKeys);
    setPlan(newPlan);
  };

  const clearHighlights = () => setModifiedPartyKeys(new Set());

  const assistant = useAssistant({ members, onMembersChange: setMembers, plan, onPlanChange: handlePlanChange });
  const [assistantAvailable, refreshAssistantAvailability] = useAssistantAvailability();
  const openAssistant = () => {
    completeTutorialStep('aiAssistant');
    assistant.setIsOpen(true);
  };

  const assistantPanel = (
    <AssistantPanel
      messages={assistant.messages}
      onSend={assistant.sendMessage}
      onRevert={assistant.revertTurn}
      onRedo={assistant.redoTurn}
      onClear={assistant.clearMessages}
      isSending={assistant.isSending}
      streamingReply={assistant.streamingReply}
      thinkingText={assistant.thinkingText}
      toolActivity={assistant.toolActivity}
      statusMessage={assistant.statusMessage}
      width={assistant.width}
      onWidthChange={assistant.setWidth}
      onClose={() => assistant.setIsOpen(false)}
      displayMode={assistant.displayMode}
      onDisplayModeChange={assistant.setDisplayMode}
      showThinkingMessages={assistant.showThinkingMessages}
      onShowThinkingMessagesChange={assistant.setShowThinkingMessages}
    />
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        hasPlan={!!plan}
        onPreferencesSaved={refreshAssistantAvailability}
        onWebuntisSaved={setWebuntisConfigured}
        onResetTutorial={resetTutorial}
        tutorialHighlightSettings={tutorialStep === 'webuntis'}
        tutorialOpenSettingsRequest={settingsRequest}
        tutorialOpenAiAssistantSettings={tutorialStep === 'aiAssistant'}
        onPreferencesOpenChange={setPreferencesOpen}
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto">
          <main className="container mx-auto px-4 py-8 max-w-5xl">
            {viewMode === 'members' ? (
              <MembersPanel
                members={members}
                onMembersChange={setMembers}
                hasPlan={!!plan}
                onNavigateToPlan={handleViewPlan}
                referenceDate={referenceDate}
                tutorialHighlightMemberActions={tutorialStep === 'members' && members.length === 0}
              />
            ) : plan ? (
              <PlanViewer
                plan={plan}
                onPlanChange={handlePlanChange}
                members={members}
                onMembersChange={setMembers}
                referenceDate={referenceDate}
                modifiedPartyKeys={modifiedPartyKeys}
                onClearHighlights={clearHighlights}
                tutorialHighlightEdit={tutorialStep === 'manualChanges'}
                tutorialHighlightExport={tutorialStep === 'export'}
                onManualPlanChange={() => completeTutorialStep('manualChanges')}
                onPngExported={() => completeTutorialStep('export')}
              />
            ) : (
              <div className="max-w-md mx-auto">
                <PlanControls
                  members={members}
                  plan={plan}
                  onPlanChange={handlePlanChange}
                  onViewPlan={handleViewPlan}
                  onReferenceDateChange={setReferenceDate}
                  tutorialHighlightGenerate={tutorialStep === 'plan'}
                />
              </div>
            )}
          </main>
        </div>

        {assistant.isOpen && assistant.displayMode === 'sidebar' && assistantPanel}
        {tutorialOpen && (
          <TutorialAssistant
            progress={tutorialProgress}
            onCompleteStep={completeTutorialStep}
            onClose={() => setTutorialOpen(false)}
            onNavigate={navigateTutorial}
            showNavigation={
              tutorialStep === 'aiAssistant'
                ? !preferencesOpen
                : tutorialStep === 'members'
                  ? viewMode !== 'members'
                  : tutorialStep === 'results'
                    ? !(viewMode === 'plan' && isSummary)
                    : tutorialStep === 'manualChanges'
                      ? !(viewMode === 'plan' && isPlanSchedule)
                      : tutorialStep === 'export' || tutorialStep === 'plan'
                        ? viewMode !== 'plan'
                        : false
            }
          />
        )}
      </div>

      {assistantAvailable && !assistant.isOpen && <AssistantFab onClick={openAssistant} />}

      {assistant.isOpen && assistant.displayMode === 'dialog' && (
        <Dialog open onOpenChange={(open) => { if (!open) assistant.setIsOpen(false); }}>
          <DialogContent className="max-w-4xl w-[92vw] h-[85vh] p-0 gap-0 flex flex-col overflow-hidden [&>button:last-child]:hidden">
            <DialogTitle className="sr-only">Assistant</DialogTitle>
            {assistantPanel}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Index;
