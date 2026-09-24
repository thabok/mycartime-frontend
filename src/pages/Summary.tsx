import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PartyPopper, Car, Fuel, Coins, Leaf, Github, Heart, X } from 'lucide-react';
import { Member, DrivingPlan } from '@/types/carpool';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { getTotalDriveCount } from '@/lib/planFormat';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { HeroMetric, Metric, MetricsGrid } from '@/components/MetricCard';
import { Separator } from '@/components/ui/separator';
import { FeedbackDialog } from '@/components/FeedbackDialog';

// Every assumption below is arbitrary but stated explicitly so the numbers
// stay honest rather than pretending to be a precise measurement.
const SCHOOL_DAYS_PER_TERM = 95;
const TWO_WEEK_CYCLE_DAYS = 10; // 5 weekdays x week A + 5 weekdays x week B
const KM_PER_DRIVE = 100; // 50km one-way, round trip
const LITERS_PER_100KM = 8;
const EURO_PER_LITER = 2;
const CO2_KG_PER_LITER = 2.3; // average tailpipe emissions for petrol

const numberFormat = new Intl.NumberFormat('de-DE');
const decimalFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

const Summary = () => {
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [members] = useLocalStorage<Member[]>('carpool-members', []);
  const [plan] = useLocalStorage<DrivingPlan | null>('carpool-plan', null);

  if (!plan) {
    navigate('/plan', { replace: true });
    return null;
  }

  const totalDrivesInCycle = getTotalDriveCount(plan.summary);
  const avgDrivesPerDay = totalDrivesInCycle / TWO_WEEK_CYCLE_DAYS;
  const drivesWithCarpool = Math.round(avgDrivesPerDay * SCHOOL_DAYS_PER_TERM);
  const drivesWithoutCarpool = members.length * SCHOOL_DAYS_PER_TERM;
  const drivesSaved = Math.max(0, drivesWithoutCarpool - drivesWithCarpool);
  const drivesSavedPercent = drivesWithoutCarpool > 0 ? (drivesSaved / drivesWithoutCarpool) * 100 : 0;

  const kmSaved = drivesSaved * KM_PER_DRIVE;
  const litersSaved = (kmSaved / 100) * LITERS_PER_100KM;
  const moneySaved = litersSaved * EURO_PER_LITER;
  const co2SavedKg = litersSaved * CO2_KG_PER_LITER;

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header
        viewMode="plan"
        onViewModeChange={() => navigate('/plan')}
        hasPlan
        showNav={false}
        onPreferencesSaved={() => {}}
      />

      <div className="flex-1 overflow-y-auto">
        <main className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <PartyPopper className="h-6 w-6" />
                <h1 className="text-2xl font-semibold text-foreground">Nice work, this plan pays off!</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Here's what your carpool is worth over a full term, compared to everyone driving alone.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/plan')} className="h-9 w-9 p-0 flex-shrink-0" title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <HeroMetric
            icon={Car}
            label="Drives saved / term"
            value={numberFormat.format(drivesSaved)}
            tooltip={`Assuming a ${SCHOOL_DAYS_PER_TERM}-day term: without a carpool that's ${numberFormat.format(drivesWithoutCarpool)} drives (${members.length} members x ${SCHOOL_DAYS_PER_TERM} days). Your plan currently averages ${decimalFormat.format(avgDrivesPerDay)} drives/day, i.e. ${numberFormat.format(drivesWithCarpool)} drives for the term - a ${decimalFormat.format(drivesSavedPercent)}% reduction.`}
          />

          <MetricsGrid>
            <Metric
              icon={Car}
              label="Kilometers saved"
              value={`${numberFormat.format(kmSaved)} km`}
              tooltip="Assuming 50km per one-way trip (100km round trip) per drive saved."
            />
            <Metric
              icon={Fuel}
              label="Fuel saved"
              value={`${numberFormat.format(Math.round(litersSaved))} L`}
              tooltip="Assuming 8 liters of fuel per 100km."
            />
            <Metric
              icon={Coins}
              label="Money saved"
              value={`€${numberFormat.format(Math.round(moneySaved))}`}
              tooltip="Assuming €2 per liter of fuel."
            />
            <Metric
              icon={Leaf}
              label="CO₂ saved"
              value={`${numberFormat.format(Math.round(co2SavedKg))} kg`}
              tooltip="Assuming 2.3kg of CO₂ per liter of fuel burned."
            />
          </MetricsGrid>

          <p className="text-xs text-muted-foreground">
            Hover for details. All figures are rough, transparent estimates - not measurements - meant to give you a feel for the
            impact of carpooling, not an exact accounting.
          </p>

          <Separator />

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Carpool Planner is a{' '}
              <a href="https://github.com/thabok/mycartime" target="_blank" rel="noreferrer" className="text-primary underline hover:text-primary/90 inline-flex items-center gap-1">
                <Github className="h-3.5 w-3.5" />
                passion project on GitHub
              </a>
              , built and maintained for free in my spare time - non-commercial and fully open source.
            </p>
            <p>
              Found a bug or have an idea?{' '}
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="font-medium text-primary underline hover:text-primary/90"
              >
                Send feedback
              </button>{' '}
              - it opens a GitHub issue on the project directly.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <img src="/kofi-qr-code.png" alt="Ko-fi QR code" className="h-24 w-24 rounded-md border border-border" />
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Heart className="h-4 w-4 text-primary" />
                  Enjoying the app?
                </div>
                <p>
                  If it's saving you time, consider{' '}
                  <a href="https://ko-fi.com/thabok" target="_blank" rel="noreferrer" className="text-primary underline hover:text-primary/90">
                    buying me a coffee
                  </a>{' '}
                  to support development.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
};

export default Summary;
