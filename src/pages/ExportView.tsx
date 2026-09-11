import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { DrivingPlan, Member } from '@/types/carpool';
import { ExportTable } from '@/components/ExportTable';

// Standalone route showing a single week's table without app chrome. The PNG
// export itself no longer goes through here (it renders ExportTable offscreen
// inside the app - see lib/exportPng.ts); this route is kept as a plain
// shareable/printable view.
function readLocalStorageJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function ExportView() {
  const [searchParams] = useSearchParams();
  const isWeekA = searchParams.get('week')?.toUpperCase() !== 'B';

  const plan = readLocalStorageJson<DrivingPlan>('carpool-plan');
  const members = readLocalStorageJson<Member[]>('carpool-members') ?? [];
  const referenceDateString = readLocalStorageJson<string | null>('carpool-reference-date');
  const referenceDate = referenceDateString ? parseISO(referenceDateString) : undefined;
  const showDesignatedDriver = readLocalStorageJson<boolean>('carpool-show-designated-driver') ?? false;
  const showSoloDriver = readLocalStorageJson<boolean>('carpool-show-solo-driver') ?? false;

  // This route renders outside the main app shell (no <Header>), so the theme
  // toggle's effect never runs here - apply it directly from localStorage.
  useEffect(() => {
    const isDark = readLocalStorageJson<boolean>('carpool-theme-dark') ?? false;
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-8">
        <p className="text-muted-foreground">No driving plan found. Open the app and generate or load a plan first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <ExportTable
        plan={plan}
        members={members}
        referenceDate={referenceDate}
        showDesignatedDriver={showDesignatedDriver}
        showSoloDriver={showSoloDriver}
        isWeekA={isWeekA}
      />
    </div>
  );
}
