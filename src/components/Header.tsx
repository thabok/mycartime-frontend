import { Car, Users, CalendarDays, MessageSquare, Moon, Settings, Sun } from 'lucide-react';
import { ViewMode } from '@/types/carpool';
import { Button } from '@/components/ui/button';
import { FeedbackDialog } from '@/components/FeedbackDialog';
import { PreferencesDialog } from '@/components/PreferencesDialog';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface HeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hasPlan: boolean;
}

export function Header({ viewMode, onViewModeChange, hasPlan }: HeaderProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Theme is a personal preference, persisted in localStorage rather than the URL.
  const [isDark, setIsDark] = useLocalStorage(
    'carpool-theme-dark',
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    // Apply theme on mount and when changed
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <header className="flex-shrink-0 border-b border-border bg-card/50 backdrop-blur-sm z-50">
      <div className="container mx-auto px-4 py-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Car className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Carpool Planner</h1>
              <p className="text-sm text-muted-foreground">For Teachers</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-2">
            <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="h-9 w-9 p-0"
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreferencesOpen(true)}
              className="h-9 w-9 p-0"
              title="Preferences"
            >
              <Settings className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFeedbackOpen(true)}
              className="gap-2"
              title="Send feedback"
            >
              <MessageSquare className="h-4 w-4" />
              Feedback
            </Button>

            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl">
              <Button
                variant={viewMode === 'members' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('members')}
                className={cn(
                  "gap-2 transition-all",
                  viewMode === 'members' && "shadow-sm"
                )}
              >
                <Users className="h-4 w-4" />
                Members
              </Button>
              <Button
                variant={viewMode === 'plan' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('plan')}
                className={cn(
                  "gap-2 transition-all",
                  viewMode === 'plan' && "shadow-sm"
                )}
              >
                <CalendarDays className="h-4 w-4" />
                Driving Plan
              </Button>
            </div>
          </nav>
        </div>
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
    </header>
  );
}
