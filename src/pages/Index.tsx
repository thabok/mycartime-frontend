import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { Member, DrivingPlan, ViewMode } from '@/types/carpool';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useAssistant } from '@/hooks/useAssistant';
import { diffModifiedPartyKeys } from '@/lib/planDiff';
import { Header } from '@/components/Header';
import { MembersPanel } from '@/components/MembersPanel';
import { PlanControls } from '@/components/PlanControls';
import { PlanViewer } from '@/components/PlanViewer';
import { AssistantFab } from '@/components/AssistantFab';
import { AssistantPanel } from '@/components/AssistantPanel';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';

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
  const location = useLocation();
  const navigate = useNavigate();
  const viewMode: ViewMode = location.pathname.startsWith('/plan') ? 'plan' : 'members';

  const handleViewModeChange = (mode: ViewMode) => {
    navigate(mode === 'plan' ? '/plan' : '/members');
  };

  const handleViewPlan = () => {
    navigate('/plan');
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
              />
            ) : (
              <div className="max-w-md mx-auto">
                <PlanControls
                  members={members}
                  plan={plan}
                  onPlanChange={handlePlanChange}
                  onViewPlan={handleViewPlan}
                  onReferenceDateChange={setReferenceDate}
                />
              </div>
            )}
          </main>
        </div>

        {assistant.isOpen && assistant.displayMode === 'sidebar' && assistantPanel}
      </div>

      {!assistant.isOpen && <AssistantFab onClick={() => assistant.setIsOpen(true)} />}

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
