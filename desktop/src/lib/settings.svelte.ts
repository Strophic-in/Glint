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

export interface Settings {
  mode: Mode;
  context: string;
  session: SessionInfo;
  docs: Doc[];
  zoom: number;
  /** Answer model id from the server's list; '' = server default. */
  model: string;
  language: string;
  autoAnswer: boolean;
  screen: boolean;
  mic: boolean;
  system: boolean;
  micDevice: string;
  speakerDevice: string;
  protected: boolean;
  opacity: number;
  bindings: Record<string, string>;
  tipsSeen: boolean;
}

export const DEFAULT_BINDINGS: Record<string, string> = {
  toggle: 'Ctrl+Backslash',
  answer: 'Ctrl+Enter',
  screen: 'Ctrl+Shift+Enter',
  listen: 'Ctrl+Shift+L',
  type: 'Ctrl+Shift+Space',
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
  autoAnswer: true,
  screen: true,
  mic: true,
  system: true,
  micDevice: '',
  speakerDevice: '',
  protected: true,
  opacity: 0.94,
  bindings: { ...DEFAULT_BINDINGS },
  tipsSeen: false,
};

const KEY = 'glint.settings.v1';

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      ...DEFAULTS,
      ...raw,
      session: { ...DEFAULTS.session, ...(raw.session ?? {}) },
      docs: Array.isArray(raw.docs) ? raw.docs : [],
      bindings: { ...DEFAULT_BINDINGS, ...(raw.bindings ?? {}) },
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

export const LANGUAGES = ['English', 'Hinglish', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Japanese'];
