export const TUTORIAL_STEPS = [
  'webuntis',
  'members',
  'plan',
  'results',
  'manualChanges',
  'export',
  'aiAssistant',
] as const;

export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

export type TutorialProgress = Record<TutorialStep, boolean>;

export const EMPTY_TUTORIAL_PROGRESS: TutorialProgress = {
  webuntis: false,
  members: false,
  plan: false,
  results: false,
  manualChanges: false,
  export: false,
  aiAssistant: false,
};

export const TUTORIAL_STEP_LABELS: Record<TutorialStep, string> = {
  webuntis: 'WebUntis connection details',
  members: 'Member roster',
  plan: 'First Driving Plan',
  results: 'Check out the results',
  manualChanges: 'Adapt a driving plan',
  export: 'Export the plan (as a PNG)',
  aiAssistant: 'AI Assistant (optional)',
};
