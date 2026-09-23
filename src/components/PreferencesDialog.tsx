import { useEffect, useState } from 'react';
import { Globe, Undo, SlidersHorizontal, Sparkles, CheckCircle2, XCircle, Palette } from 'lucide-react';
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
import { testWebuntisConnection } from '@/lib/webuntisApi';
import { testAssistantConnection } from '@/lib/assistantApi';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useTheme, type ThemePreference } from '@/hooks/useTheme';

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after preferences are successfully saved, so callers can react
  // immediately (e.g. re-check whether the AI assistant button should be
  // shown) instead of waiting for the next app load.
  onSaved: () => void;
  onWebuntisSaved?: (configured: boolean) => void;
  onResetTutorial?: () => void;
  initialCategory?: Category;
}

interface Settings {
  WEBUNTIS_SERVER: string;
  WEBUNTIS_SCHOOL: string;
  WEBUNTIS_USERNAME: string;
  WEBUNTIS_AUTH_MODE: 'password' | 'secret';
  WEBUNTIS_PASSWORD: string;
  WEBUNTIS_SECRET: string;
  TIME_TOLERANCE_MINUTES: number;
  MAX_DRIVES_FULLTIME: number;
  MAX_DRIVES_PARTTIME: number;
  CLAUDE_CLI_PATH: string;
}

// Fields the backend never sends back, only whether a value is stored - see
// user_settings.SECRET_SETTINGS.
const SECRET_KEYS = ['WEBUNTIS_PASSWORD', 'WEBUNTIS_SECRET'] as const satisfies readonly (keyof Settings)[];
type SecretKey = (typeof SECRET_KEYS)[number];

const DEFAULT_STORED_VALUE_PLACEHOLDER = '••••••••';

type Category = 'webuntis' | 'planGeneration' | 'aiAssistant' | 'stuffAndThings';

const CATEGORIES: { id: Category; label: string; icon: typeof Globe }[] = [
  { id: 'webuntis', label: 'WebUntis', icon: Globe },
  { id: 'planGeneration', label: 'Plan generation', icon: SlidersHorizontal },
  { id: 'aiAssistant', label: 'AI Assistant', icon: Sparkles },
  { id: 'stuffAndThings', label: 'Stuff and things', icon: Palette },
];

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Auto' },
];

const CATEGORY_NOTES: Partial<Record<Category, string>> = {};

interface ConfigField {
  category: Category;
  key: keyof Settings;
  label: string;
  description: string;
  type: 'text' | 'number' | 'password' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  // If set, the field is only shown when this returns true for the current
  // (in-progress, unsaved) settings - e.g. the password field only when
  // WEBUNTIS_AUTH_MODE is 'password'.
  visibleWhen?: (settings: Settings) => boolean;
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
    category: 'webuntis',
    key: 'WEBUNTIS_USERNAME',
    label: 'Username',
    description: '',
    type: 'text',
  },
  {
    category: 'webuntis',
    key: 'WEBUNTIS_AUTH_MODE',
    label: 'Login method',
    description:
      "Some schools' teachers sign in via an SSO provider like IServ (\"Anmelden über iserv\") and have no WebUntis password of their own. Those accounts should use the secret key instead - it's on the WebUntis website under profile > Freigaben, listed for the mobile app (also shown as a QR code).",
    type: 'select',
    options: [
      { value: 'password', label: 'Password' },
      { value: 'secret', label: 'Secret key (IServ / SSO)' },
    ],
  },
  {
    category: 'webuntis',
    key: 'WEBUNTIS_PASSWORD',
    label: 'Password',
    description: '',
    type: 'password',
    visibleWhen: (s) => s.WEBUNTIS_AUTH_MODE !== 'secret',
  },
  {
    category: 'webuntis',
    key: 'WEBUNTIS_SECRET',
    label: 'Secret key',
    description:
      'The "Schlüssel" value from WebUntis profile > Freigaben (mobile app section), not your WebUntis password.',
    type: 'password',
    visibleWhen: (s) => s.WEBUNTIS_AUTH_MODE === 'secret',
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
    key: 'CLAUDE_CLI_PATH',
    label: 'Path to the claude CLI',
    description:
      'Full path to the executable, e.g. /opt/homebrew/bin/claude.',
    type: 'text',
    placeholder: 'claude',
  },
];

type SettingsResponse = Omit<Settings, SecretKey> & { [K in SecretKey as `${K}_SET`]: boolean };

export function PreferencesDialog({ open, onOpenChange, onSaved, onWebuntisSaved, onResetTutorial, initialCategory }: PreferencesDialogProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Remembered across dialog opens (and app restarts) so returning to
  // Settings lands back on whichever category was last viewed.
  const [category, setCategory] = useLocalStorage<Category>('carpool-preferences-category', 'webuntis');
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [storedFlags, setStoredFlags] = useState<Record<SecretKey, boolean>>(
    Object.fromEntries(SECRET_KEYS.map((key) => [key, false])) as Record<SecretKey, boolean>
  );
  const [clearFlags, setClearFlags] = useState<Partial<Record<SecretKey, boolean>>>({});
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const { toast } = useToast();
  const { preference: themePreference, setThemePreference } = useTheme();
  const backendHostAndPort = getBackendUrl();
  // Same storage the driving-plan page's "Schedule Access" card
  // (useWebuntisCredentials) reads/writes, so the two are always in sync:
  // these fields are a convenience for testing the connection here, not a
  // second, independent copy of the credentials.
  const [sharedUsername, setSharedUsername] = useLocalStorage<string>('carpool-username', '');
  const [sharedPassword, setSharedPassword] = useSessionStorage<string>('carpool-password', '');

  useEffect(() => {
    if (open && initialCategory) setCategory(initialCategory);
  }, [open, initialCategory, setCategory]);

  // Fetch the current server-side settings every time the dialog is opened,
  // since they can be changed by anyone using this app (shared backend).
  useEffect(() => {
    if (!open) return;

    setTestResult(null);
    setIsLoading(true);
    fetch(`${backendHostAndPort}/api/v1/settings`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load settings');
        return response.json();
      })
      .then((response: SettingsResponse) => {
        const flags = Object.fromEntries(
          SECRET_KEYS.map((key) => [key, !!response[`${key}_SET`]])
        ) as Record<SecretKey, boolean>;
        const rest = { ...response } as Record<string, unknown>;
        for (const key of SECRET_KEYS) delete rest[`${key}_SET`];

        // Secret fields always start blank; a non-empty value means "replace".
        const normalized = { ...rest } as unknown as Settings;
        for (const key of SECRET_KEYS) normalized[key] = '';
        // The driving-plan page's credentials are the live, current value -
        // prefer them over whatever is saved server-side so both fields
        // always show the same thing.
        if (sharedUsername.trim()) normalized.WEBUNTIS_USERNAME = sharedUsername.trim();
        if (sharedPassword.trim()) normalized.WEBUNTIS_PASSWORD = sharedPassword;

        setSettings(normalized);
        setOriginalSettings(normalized);
        setStoredFlags(flags);
        setClearFlags({});
      })
      .catch(() => {
        toast({ title: 'Could not load preferences', variant: 'destructive' });
        onOpenChange(false);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Username/password changes also write straight through to the shared
  // storage the driving-plan page reads, so they take effect there
  // immediately - these two fields are just a view onto the same value, not
  // a separate draft that only applies on Save.
  const updateField = (key: keyof Settings, value: Settings[keyof Settings]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (key === 'WEBUNTIS_USERNAME') setSharedUsername(String(value));
    if (key === 'WEBUNTIS_PASSWORD') setSharedPassword(String(value));
  };

  const dirtyKeys = new Set(
    settings && originalSettings
      ? CONFIG_FIELDS.filter((field) => settings[field.key] !== originalSettings[field.key]).map(
          (field) => field.key
        )
      : []
  );
  const hasUnsavedChanges = dirtyKeys.size > 0 || Object.values(clearFlags).some(Boolean);

  const savePreferences = async () => {
    if (!settings) return;

    // Only send fields the backend actually accepts - `settings` also
    // carries read-only, computed fields (e.g. WEBUNTIS_MOCK_MODE) from the
    // GET response, which the backend rejects as unknown settings.
    const body: Record<string, unknown> = Object.fromEntries(
      CONFIG_FIELDS.map((field) => [field.key, settings[field.key]])
    );

    // An untouched secret field must not wipe the stored value, so it is
    // only sent when the user typed a replacement or explicitly asked to
    // remove it.
    for (const key of SECRET_KEYS) {
      if (settings[key]) body[key] = settings[key];
      else if (clearFlags[key]) body[key] = '';
      else delete body[key];
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${backendHostAndPort}/api/v1/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(responseBody?.error || 'Failed to save preferences');
      }

      setShowUnsavedPrompt(false);
      onOpenChange(false);
      onSaved();
      // The hidden mock/demo server (see backend/mock_webuntis.py) never
      // needs a username or password/secret - the backend reports this via
      // WEBUNTIS_MOCK_MODE so the server URL alone counts as "configured".
      const hasWebuntisDetails = Boolean(
        settings.WEBUNTIS_SERVER.trim() &&
        (responseBody?.WEBUNTIS_MOCK_MODE || (
          settings.WEBUNTIS_USERNAME.trim() &&
          (settings.WEBUNTIS_AUTH_MODE === 'secret'
            ? settings.WEBUNTIS_SECRET.trim() || storedFlags.WEBUNTIS_SECRET
            : settings.WEBUNTIS_PASSWORD.trim() || storedFlags.WEBUNTIS_PASSWORD)
        ))
      );
      onWebuntisSaved?.(hasWebuntisDetails);
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
    if (originalSettings) {
      setSharedUsername(originalSettings.WEBUNTIS_USERNAME);
      setSharedPassword(originalSettings.WEBUNTIS_PASSWORD);
    }
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
            <div className="flex h-[34rem] border-t border-border">
              <nav className="flex w-44 flex-shrink-0 flex-col border-r border-border bg-muted/30 py-2 overflow-y-auto">
                {CATEGORIES.map(({ id, label, icon: Icon }) => {
                  const categoryDirty = CONFIG_FIELDS.some(
                    (field) => field.category === id && dirtyKeys.has(field.key)
                  );
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setCategory(id);
                        setTestResult(null);
                      }}
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
                {onResetTutorial && (
                  <Button variant="ghost" className="mx-2 mt-auto justify-start text-xs text-muted-foreground" onClick={onResetTutorial}>
                    Reset tutorial
                  </Button>
                )}
              </nav>

              <div className="flex-1 space-y-4 p-6 overflow-y-auto">
                {CATEGORY_NOTES[category] && (
                  <p className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md p-3">
                    {CATEGORY_NOTES[category]}
                  </p>
                )}
                {CONFIG_FIELDS.filter(
                  (field) => field.category === category && (!field.visibleWhen || field.visibleWhen(settings))
                ).map((field) => {
                  const inputId = `pref-${field.key}`;
                  const value = settings[field.key];
                  const isDirty = dirtyKeys.has(field.key);
                  const isSecret = (SECRET_KEYS as readonly string[]).includes(field.key);
                  const secretKey = field.key as SecretKey;
                  const keyStored = isSecret && storedFlags[secretKey];
                  const clearKey = isSecret && !!clearFlags[secretKey];
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
                                onClick={() => updateField(field.key, originalSettings![field.key])}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Undo className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Reset to previous state</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {field.type === 'select' ? (
                        <div className="flex rounded-md border border-border p-1 gap-1 w-fit">
                          {field.options!.map(({ value: optionValue, label }) => (
                            <button
                              key={optionValue}
                              type="button"
                              onClick={() => updateField(field.key, optionValue)}
                              className={cn(
                                'rounded px-3 py-1 text-sm transition-colors',
                                value === optionValue
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Input
                          id={inputId}
                          type={field.type}
                          min={field.type === 'number' ? 0 : undefined}
                          value={value}
                          placeholder={
                            keyStored && !clearKey
                              ? DEFAULT_STORED_VALUE_PLACEHOLDER
                              : field.placeholder
                          }
                          onChange={(e) =>
                            updateField(
                              field.key,
                              field.type === 'number' ? Number(e.target.value) : e.target.value
                            )
                          }
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        {field.description}
                        {keyStored && !value && (
                          <>
                            {' '}
                            {clearKey ? (
                              <span className="text-destructive">
                                The saved value will be removed when you save.{' '}
                                <button
                                  type="button"
                                  className="underline hover:no-underline"
                                  onClick={() => setClearFlags({ ...clearFlags, [secretKey]: false })}
                                >
                                  Keep it
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="underline hover:no-underline"
                                onClick={() => setClearFlags({ ...clearFlags, [secretKey]: true })}
                              >
                                Remove the saved value
                              </button>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  );
                })}

                {category === 'webuntis' && (
                  <div className="space-y-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isTestingConnection}
                      onClick={async () => {
                        setIsTestingConnection(true);
                        setTestResult(null);
                        try {
                          const result = await testWebuntisConnection({
                            server: settings.WEBUNTIS_SERVER,
                            school: settings.WEBUNTIS_SCHOOL,
                            username: settings.WEBUNTIS_USERNAME,
                            authMode: settings.WEBUNTIS_AUTH_MODE,
                            password: settings.WEBUNTIS_PASSWORD,
                            secret: settings.WEBUNTIS_SECRET,
                          });
                          setTestResult({
                            success: result.success,
                            message: result.success
                              ? 'Connection successful.'
                              : result.error || 'Connection failed.',
                          });
                        } catch (error) {
                          setTestResult({
                            success: false,
                            message: error instanceof Error ? error.message : 'Could not connect. Please check your internet connection and try again.',
                          });
                        } finally {
                          setIsTestingConnection(false);
                        }
                      }}
                    >
                      {isTestingConnection ? 'Testing...' : 'Test connection'}
                    </Button>
                    {testResult && (
                      <p
                        className={cn(
                          'flex items-center gap-1.5 text-xs',
                          testResult.success ? 'text-emerald-600' : 'text-destructive'
                        )}
                      >
                        {testResult.success ? (
                          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        {testResult.message}
                      </p>
                    )}
                  </div>
                )}

                {category === 'aiAssistant' && (
                  <div className="space-y-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isTestingConnection}
                      onClick={async () => {
                        setIsTestingConnection(true);
                        setTestResult(null);
                        try {
                          const result = await testAssistantConnection({
                            cliPath: settings.CLAUDE_CLI_PATH,
                          });
                          setTestResult({ success: result.success, message: result.message });
                        } catch (error) {
                          setTestResult({
                            success: false,
                            message: error instanceof Error ? error.message : 'Could not connect. Please check your internet connection and try again.',
                          });
                        } finally {
                          setIsTestingConnection(false);
                        }
                      }}
                    >
                      {isTestingConnection ? 'Testing...' : 'Test connection'}
                    </Button>
                    {testResult && (
                      <p
                        className={cn(
                          'flex items-center gap-1.5 text-xs',
                          testResult.success ? 'text-emerald-600' : 'text-destructive'
                        )}
                      >
                        {testResult.success ? (
                          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        {testResult.message}
                      </p>
                    )}
                  </div>
                )}

                {category === 'stuffAndThings' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Theme</Label>
                    </div>
                    <div className="flex rounded-md border border-border p-1 gap-1 w-fit">
                      {THEME_OPTIONS.map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setThemePreference(id)}
                          className={cn(
                            'rounded px-3 py-1 text-sm transition-colors',
                            themePreference === id
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Auto follows your operating system's light/dark setting.
                    </p>
                  </div>
                )}
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
