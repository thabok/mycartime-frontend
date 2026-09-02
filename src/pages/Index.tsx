import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Member, DrivingPlan, ViewMode } from '@/types/carpool';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Header } from '@/components/Header';
import { MembersPanel } from '@/components/MembersPanel';
import { PlanControls } from '@/components/PlanControls';
import { PlanViewer } from '@/components/PlanViewer';
import { Toaster } from '@/components/ui/toaster';

const Index = () => {
  const [members, setMembers] = useLocalStorage<Member[]>('carpool-members', []);
  const [plan, setPlan] = useLocalStorage<DrivingPlan | null>('carpool-plan', null);
  const [referenceDate, setReferenceDate] = useState<Date | undefined>();
  const location = useLocation();
  const navigate = useNavigate();
  const viewMode: ViewMode = location.pathname.startsWith('/plan') ? 'plan' : 'members';

  const handleViewModeChange = (mode: ViewMode) => {
    navigate(mode === 'plan' ? '/plan' : '/members');
  };

  const handleViewPlan = () => {
    navigate('/plan');
  };

  return (
    <div className="min-h-screen bg-background">
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
  );
};

export default Index;
