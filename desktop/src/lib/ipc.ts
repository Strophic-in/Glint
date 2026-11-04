import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface Me {
  user: User;
  balance_seconds: number;
  expires_at: number | null;
  live: boolean;
  trial_seconds: number;
}

export interface ModelOption {
  id: string;
  label: string;
  tag: string;
  hint: string;
}

export interface DocText {
  name: string;
  text: string;
  chars: number;
  truncated: boolean;
}

export interface ApiError {
  status: number;
  error: string;
  message: string;
}

export const errorMessage = (e: unknown) =>
  (e as ApiError)?.message ?? (typeof e === 'string' ? e : 'Something went wrong.');

export const ipc = {
  config: () => invoke<{ api_url: string; web_url: string; version: string }>('get_config'),
  authStatus: () => invoke<Me | null>('auth_status'),
  authBegin: () => invoke<{ user_code: string; verify_url: string }>('auth_begin'),
  authCancel: () => invoke<void>('auth_cancel'),
  logout: () => invoke<void>('logout'),
  me: () => invoke<Me>('me'),
  models: () => invoke<{ models: ModelOption[]; default: string }>('models'),
  listenStart: (mic: boolean, system: boolean, micDevice: string | null, systemDevice: string | null) =>
    invoke<void>('listen_start', { mic, system, micDevice, systemDevice }),
  listenStop: () => invoke<void>('listen_stop'),
  ask: (id: number, body: unknown, withScreen: boolean) => invoke<void>('ask', { id, body, withScreen }),
  askCancel: () => invoke<void>('ask_cancel'),
  setBindings: (bindings: Record<string, string>) =>
    invoke<Record<string, string>>('set_bindings', { bindings }),
  defaultBindings: () => invoke<Record<string, string>>('default_bindings'),
  setContextualKeys: (on: boolean) => invoke<void>('set_contextual_keys', { on }),
  suspendShortcuts: (on: boolean) => invoke<void>('suspend_shortcuts', { on }),
  setTyping: (on: boolean, restore = true) => invoke<void>('set_typing', { on, restore }),
  setProtected: (on: boolean) => invoke<void>('set_protected', { on }),
  resize: (width: number, height: number) => invoke<void>('resize', { width, height }),
  setZoom: (scale: number) => invoke<void>('set_zoom', { scale }),
  dragWindow: () => invoke<void>('drag_window'),
  pickDocument: () => invoke<DocText | null>('pick_document'),
  listMics: () => invoke<string[]>('list_mics'),
  listOutputs: () => invoke<string[]>('list_outputs'),
  openUrl: (url: string) => invoke<void>('open_url', { url }),
  hide: () => invoke<void>('hide'),
  quit: () => invoke<void>('quit'),
};

export function on<T>(event: string, cb: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => cb(e.payload));
}
