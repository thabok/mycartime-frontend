import { useEffect, useState } from 'react';
import { Globe, Undo, SlidersHorizontal, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getBackendUrl } from '@/lib/config';

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Settings {
  WEBUNTIS_SERVER: string;
  WEBUNTIS_SCHOOL: string;
  TIME_TOLERANCE_MINUTES: number;
  MAX_DRIVES_FULLTIME: number;
  MAX_DRIVES_PARTTIME: number;
  ANTHROPIC_API_KEY: string;
  CLAUDE_CLI_PATH: string;
}

type Category = 'webuntis' | 'planGeneration' | 'aiAssistant';

const CATEGORIES: { id: Category; label: string; icon: typeof Globe }[] = [
  { id: 'webuntis', label: 'WebUntis', icon: Globe },
  { id: 'planGeneration', label: 'Plan generation', icon: SlidersHorizontal },
  { id: 'aiAssistant', label: 'AI Assistant', icon: Sparkles },
];

const CATEGORY_NOTES: Partial<Record<Category, string>> = {
  aiAssistant:
    'The assistant uses your Anthropic API key when one is stored. If no key is stored, or the key stops working, it falls back to the claude CLI at the path below.',
};

interface ConfigField {
  category: Category;
  key: keyof Settings;
  label: string;
  description: string;
  type: 'text' | 'number' | 'password';
  placeholder?: string;
}

const CONFIG_FIELDS: ConfigField[] = [
  {
    category: 'webuntis',
    key: 'WEBUNTIS_SERVER',
    label: 'Server URL',
    description:
      "The WebUntis instance your school's timetables are hosted on. This is where the app looks up members' class schedules.",
    type: 'text',
    placeholder: 'https://<your-school>.webuntis.com',
  },
  {
    category: 'webuntis',
    key: 'WEBUNTIS_SCHOOL',
    label: 'School identifier',
    description:
      'Some WebUntis servers host multiple schools and need this to tell them apart. It can be left empty if your server hosts just one school.',
    type: 'text',
    placeholder: '(optional)',
  },
  {
    category: 'planGeneration',
    key: 'TIME_TOLERANCE_MINUTES',
    label: 'Time tolerance (minutes)',
    description:
      "How many minutes members are willing to wait for others. Higher values mean more waiting time but potentially better carpool matches.",
    type: 'number',
  },
  {
    category: 'planGeneration',
    key: 'MAX_DRIVES_FULLTIME',
    label: 'Max drives (full-time members)',
    description:
      'The most times a full-time member should be asked to drive over the 2-week schedule cycle.',
    type: 'number',
  },
  {
    category: 'planGeneration',
    key: 'MAX_DRIVES_PARTTIME',
    label: 'Max drives (part-time members)',
    description:
      'The most times a part-time member should be asked to drive over the 2-week schedule cycle.',
    type: 'number',
  },
  {
    category: 'aiAssistant',
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API key',
    description:
      'Kept on this computer only, in a settings file readable just by your user account. It is never sent back to this dialog once saved.',
    type: 'password',
    placeholder: 'sk-ant-...',
  },
  {
    category: 'aiAssistant',
    key: 'CLAUDE_CLI_PATH',
    label: 'Path to the claude CLI',
    description:
      'Full path to the executable, e.g. /opt/homebrew/bin/claude. Needed because an app started from the Dock does not inherit your shell\'s PATH. Leave empty to search PATH.',
    type: 'text',
    placeholder: '/opt/homebrew/bin/claude',
  },
];

// The backend never sends the API key back, only whether one is stored.
type SettingsResponse = Omit<Settings, 'ANTHROPIC_API_KEY'> & { ANTHROPIC_API_KEY_SET: boolean };

export function PreferencesDialog({ open, onOpenChange }: PreferencesDialogProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [category, setCategory] = useState<Category>('webuntis');
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [keyStored, setKeyStored] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const { toast } = useToast();
  const backendHostAndPort = getBackendUrl();

  // Fetch the current server-side settings every time the dialog is opened,
  // since they can be changed by anyone using this app (shared backend).
  useEffect(() => {
    if (!open) return;

    setCategory('webuntis');
    setIsLoading(true);
    fetch(`${backendHostAndPort}/api/v1/settings`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load settings');
        return response.json();
      })
      .then(({ ANTHROPIC_API_KEY_SET, ...rest }: SettingsResponse) => {
        // The key field always starts blank; a non-empty value means "replace".
        const normalized: Settings = { ...rest, ANTHROPIC_API_KEY: '' };
        setSettings(normalized);
        setOriginalSettings(normalized);
        setKeyStored(ANTHROPIC_API_KEY_SET);
        setClearKey(false);
      })
      .catch(() => {
        toast({ title: 'Could not load preferences', variant: 'destructive' });
        onOpenChange(false);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirtyKeys = new Set(
    settings && originalSettings
      ? CONFIG_FIELDS.filter((field) => settings[field.key] !== originalSettings[field.key]).map(
          (field) => field.key
        )
      : []
  );
  const hasUnsavedChanges = dirtyKeys.size > 0 || clearKey;

  const savePreferences = async () => {
    if (!settings) return;

    // An untouched key field must not wipe the stored key, so it is only sent
    // when the user typed a replacement or explicitly asked to remove it.
    const { ANTHROPIC_API_KEY, ...payload } = settings;
    const body: Record<string, unknown> = { ...payload };
    if (ANTHROPIC_API_KEY) body.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
    else if (clearKey) body.ANTHROPIC_API_KEY = '';

    setIsSaving(true);
    try {
      const response = await fetch(`${backendHostAndPort}/api/v1/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Failed to save preferences');
      }

      toast({ title: 'Preferences saved' });
      setShowUnsavedPrompt(false);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Could not save preferences',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedPrompt(true);
      return;
    }
    onOpenChange(false);
  };

  const discardAndExit = () => {
    setShowUnsavedPrompt(false);
    setSettings(originalSettings);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : requestClose())}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

          {isLoading || !settings ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">Loading...</p>
          ) : (
            <div className="flex min-h-[22rem] border-t border-border">
              <nav className="w-44 flex-shrink-0 border-r border-border bg-muted/30 py-2">
                {CATEGORIES.map(({ id, label, icon: Icon }) => {
                  const categoryDirty = CONFIG_FIELDS.some(
                    (field) => field.category === id && dirtyKeys.has(field.key)
                  );
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCategory(id)}
                      className={cn(
                        'flex w-full items-center gap-2 px-4 py-2 text-sm text-left transition-colors',
                        category === id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                      {categoryDirty && '*'}
                    </button>
                  );
                })}
              </nav>

              <div className="flex-1 space-y-4 p-6">
                {CATEGORY_NOTES[category] && (
                  <p className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md p-3">
                    {CATEGORY_NOTES[category]}
                  </p>
                )}
                {CONFIG_FIELDS.filter((field) => field.category === category).map((field) => {
                  const inputId = `pref-${field.key}`;
                  const value = settings[field.key];
                  const isDirty = dirtyKeys.has(field.key);
                  const isApiKey = field.key === 'ANTHROPIC_API_KEY';
                  return (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={inputId}>
                          {field.label}
                          {isDirty && '*'}
                        </Label>
                        {isDirty && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Reset ${field.label} to previous state`}
                                onClick={() =>
                                  setSettings({
                                    ...settings,
                                    [field.key]: originalSettings![field.key],
                                  })
                                }
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Undo className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Reset to previous state</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <Input
                        id={inputId}
                        type={field.type}
                        min={field.type === 'number' ? 0 : undefined}
                        value={value}
                        placeholder={
                          isApiKey && keyStored && !clearKey
                            ? '•••••••••••••••• (saved - type to replace)'
                            : field.placeholder
                        }
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            [field.key]:
                              field.type === 'number' ? Number(e.target.value) : e.target.value,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {field.description}
                        {isApiKey && keyStored && !value && (
                          <>
                            {' '}
                            {clearKey ? (
                              <span className="text-destructive">
                                The saved key will be removed when you save.{' '}
                                <button
                                  type="button"
                                  className="underline hover:no-underline"
                                  onClick={() => setClearKey(false)}
                                >
                                  Keep it
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="underline hover:no-underline"
                                onClick={() => setClearKey(true)}
                              >
                                Remove the saved key
                              </button>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={requestClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={savePreferences} disabled={isSaving || isLoading || !settings}>
              {isSaving ? 'Saving...' : 'Save preferences'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedPrompt} onOpenChange={setShowUnsavedPrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your preferences. Do you want to apply them before
              exiting?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back to dialog</AlertDialogCancel>
            <Button variant="destructive" onClick={discardAndExit}>
              Discard & exit
            </Button>
            <AlertDialogAction onClick={savePreferences} disabled={isSaving}>
              {isSaving ? 'Applying...' : 'Apply all'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
