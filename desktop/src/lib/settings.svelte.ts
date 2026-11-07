export type Mode = 'general' | 'interview' | 'sales' | 'meeting' | 'coding';
export interface SessionInfo {
  company: string;
  position: string;
  title: string;
  agenda: string;
  prospect: string;
}

export interface Doc {
  id: string;
  kind: 'resume' | 'doc';
  name: string;
  text: string;
  chars: number;
}

export type Anchor = 'top-center' | 'top-left' | 'top-right' | 'center' | 'bottom-center';

export const ANCHORS: { id: Anchor; label: string }[] = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-center', label: 'Top centre' },
  { id: 'top-right', label: 'Top right' },
  { id: 'center', label: 'Centre' },
  { id: 'bottom-center', label: 'Bottom centre' },
];

/** Size presets for the main column (CSS px); "Full width" is worked out from the screen. */
export const SIZES = [
  { id: 'compact', label: 'Compact', width: 560, answerHeight: 300 },
  { id: 'default', label: 'Default', width: 720, answerHeight: 420 },
  { id: 'large', label: 'Large', width: 960, answerHeight: 620 },
  { id: 'full', label: 'Full width', width: 0, answerHeight: 0 },
] as const;

export interface Settings {
  mode: Mode;
  context: string;
  session: SessionInfo;
  docs: Doc[];
  zoom: number;
  /** Answer model id from the server's list; '' = server default. */
  model: string;
  language: string;
  /** What the call is transcribed as: ISO codes ("en", "en,hi") or "auto". English by default so
   *  noise and accents don't get transcribed as another language. */
  speechLanguage: string;
  autoAnswer: boolean;
  /** Attach the screen to Answer and typed questions. */
  screen: boolean;
  /** Also attach it to auto-answers (sees what someone is sharing in the call). */
  screenAuto: boolean;
  /** Put code from answers in a panel to the left of the explanation. */
  codePanel: boolean;
  /** Which side of the answer the code panel opens on. */
  codeSide: 'left' | 'right';
  /** Where Glint appears at startup: a monitor name ('' = main display) and a spot on it. */
  placeMonitor: string;
  placeAnchor: Anchor;
  /** Main column width and answer height, set by dragging the corner grip (CSS px). */
  width: number;
  answerHeight: number;
  mic: boolean;
  system: boolean;
  micDevice: string;
  speakerDevice: string;
  protected: boolean;
  opacity: number;
  /** Go fully opaque while the mouse is over Glint, so a see-through overlay is still easy to read. */
  solidOnHover: boolean;
  bindings: Record<string, string>;
  tipsSeen: boolean;
}

export const DEFAULT_BINDINGS: Record<string, string> = {
  toggle: 'Ctrl+Backslash',
  answer: 'Ctrl+Enter',
  screen: 'Ctrl+Shift+Enter',
  listen: 'Ctrl+Shift+L',
  type: 'Ctrl+Shift+Space',
  toggle_code: 'Ctrl+Alt+C',
  shortcuts: 'Ctrl+Shift+Slash',
  scroll_up: 'Ctrl+Up',
  scroll_down: 'Ctrl+Down',
};

const DEFAULTS: Settings = {
  mode: 'general',
  context: '',
  session: { company: '', position: '', title: '', agenda: '', prospect: '' },
  docs: [],
  zoom: 1,
  model: '',
  language: 'English',
  speechLanguage: 'en',
  autoAnswer: true,
  screen: true,
  screenAuto: true,
  codePanel: true,
  codeSide: 'left',
  placeMonitor: '',
  placeAnchor: 'top-center',
  width: 720,
  answerHeight: 420,
  mic: true,
  system: true,
  micDevice: '',
  speakerDevice: '',
  protected: true,
  opacity: 0.94,
  solidOnHover: true,
  bindings: { ...DEFAULT_BINDINGS },
  tipsSeen: false,
};

const KEY = 'glint.settings.v1';

/** Early 0.2.4 builds shipped Ctrl+K and Ctrl+Shift+C, which take those keys away from every other
 *  app (Slack, VS Code, browsers, terminals). Move anyone still on them to the new defaults. */
const RETIRED: Record<string, string> = { shortcuts: 'Ctrl+K', toggle_code: 'Ctrl+Shift+C' };
function migrateBindings(b: Record<string, string>) {
  for (const [action, old] of Object.entries(RETIRED)) if (b[action] === old) b[action] = DEFAULT_BINDINGS[action];
  return b;
}

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      ...DEFAULTS,
      ...raw,
      session: { ...DEFAULTS.session, ...(raw.session ?? {}) },
      docs: Array.isArray(raw.docs) ? raw.docs : [],
      bindings: migrateBindings({ ...DEFAULT_BINDINGS, ...(raw.bindings ?? {}) }),
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const settings: Settings = $state(load());

export function persistSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings live for this session only */
  }
}

export interface ModeInfo {
  id: Mode;
  label: string;
  icon: string;
  intro: string;
  placeholder: string;
  fields: { key: keyof SessionInfo; label: string; placeholder: string; long?: boolean }[];
}

export const MODES: ModeInfo[] = [
  {
    id: 'interview',
    label: 'Interview',
    icon: 'briefcase',
    intro: 'Glint answers as you, the candidate, grounded in your resume.',
    placeholder: 'Anything else: years of experience, stack, projects with numbers, salary expectations…',
    fields: [
      { key: 'company', label: 'Company', placeholder: 'e.g. Google' },
      { key: 'position', label: 'Position', placeholder: 'e.g. Software Engineer' },
    ],
  },
  {
    id: 'meeting',
    label: 'Meeting',
    icon: 'phone',
    intro: 'Glint helps with whatever is being discussed, without pitching you for a role.',
    placeholder: 'Your role, the project, and what you want out of this meeting.',
    fields: [
      { key: 'title', label: 'Call title', placeholder: 'e.g. Q4 planning with Acme' },
      { key: 'agenda', label: 'Agenda', placeholder: 'e.g. Review Q4 targets', long: true },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: 'target',
    intro: 'Glint handles objections and suggests the next best question.',
    placeholder: 'Your product, pricing, ideal customer, differentiators, proof points.',
    fields: [
      { key: 'company', label: 'Your product', placeholder: 'e.g. Glint Pro' },
      { key: 'prospect', label: 'Prospect', placeholder: 'e.g. Acme Corp, Head of Sales' },
    ],
  },
  {
    id: 'coding',
    label: 'Coding',
    icon: 'code',
    intro: 'Correct, efficient code first, with the key insight and complexity.',
    placeholder: 'Preferred language and constraints, e.g. "Python, explain complexity".',
    fields: [],
  },
  {
    id: 'general',
    label: 'General',
    icon: 'sparkle',
    intro: 'A general copilot for any call or screen.',
    placeholder: 'Anything Glint should know about you or what you are working on.',
    fields: [],
  },
];

/** Limits for the corner grip. */
export const SIZE = { minWidth: 520, maxWidth: 1400, minAnswer: 140, maxAnswer: 1000 };

export const SPEECH_LANGUAGES: { id: string; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'en,hi', label: 'English + Hindi (Hinglish)' },
  { id: 'hi', label: 'Hindi' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'auto', label: 'Detect automatically' },
];

export const LANGUAGES = ['English', 'Hinglish', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Japanese'];
