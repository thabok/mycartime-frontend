import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Member, DrivingPlan, ViewMode } from '@/types/carpool';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useAssistant } from '@/hooks/useAssistant';
import { Header } from '@/components/Header';
import { MembersPanel } from '@/components/MembersPanel';
import { PlanControls } from '@/components/PlanControls';
import { PlanViewer } from '@/components/PlanViewer';
import { AssistantFab } from '@/components/AssistantFab';
import { AssistantPanel } from '@/components/AssistantPanel';
import { Toaster } from '@/components/ui/toaster';

const Index = () => {
  const [members, setMembers] = useLocalStorage<Member[]>('carpool-members', []);
  const [plan, setPlan] = useLocalStorage<DrivingPlan | null>('carpool-plan', null);
  const [referenceDate, setReferenceDate] = useState<Date | undefined>();
  const location = useLocation();
  const navigate = useNavigate();
  const viewMode: ViewMode = location.pathname.startsWith('/plan') ? 'plan' : 'members';

  const assistant = useAssistant({ members, onMembersChange: setMembers, plan, onPlanChange: setPlan });

  const handleViewModeChange = (mode: ViewMode) => {
    navigate(mode === 'plan' ? '/plan' : '/members');
  };

  const handleViewPlan = () => {
    navigate('/plan');
  };

  return (
    <div className="flex min-h-screen bg-background">
      <div className="flex-1 min-w-0">
        <Header
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          hasPlan={!!plan}
        />

        <main className="container mx-auto px-4 py-8 max-w-5xl">
          {viewMode === 'members' ? (
            <MembersPanel
              members={members}
              onMembersChange={setMembers}
              hasPlan={!!plan}
              onNavigateToPlan={handleViewPlan}
            />
          ) : plan ? (
            <PlanViewer
              plan={plan}
              onPlanChange={setPlan}
              members={members}
              onMembersChange={setMembers}
              referenceDate={referenceDate}
            />
          ) : (
            <div className="max-w-md mx-auto">
              <PlanControls
                members={members}
                plan={plan}
                onPlanChange={setPlan}
                onViewPlan={handleViewPlan}
                onReferenceDateChange={setReferenceDate}
              />
            </div>
          )}
        </main>
      </div>

      {assistant.isOpen ? (
        <AssistantPanel
          messages={assistant.messages}
          onSend={assistant.sendMessage}
          onRevert={assistant.revertTurn}
          onClear={assistant.clearMessages}
          isSending={assistant.isSending}
          streamingReply={assistant.streamingReply}
          thinkingText={assistant.thinkingText}
          toolActivity={assistant.toolActivity}
          width={assistant.width}
          onWidthChange={assistant.setWidth}
          onClose={() => assistant.setIsOpen(false)}
        />
      ) : (
        <AssistantFab onClick={() => assistant.setIsOpen(true)} />
      )}
    </div>
  );
};

export default Index;
