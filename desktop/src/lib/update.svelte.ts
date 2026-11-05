// In-app updates for the direct-download build: checks glint-api's latest.json (signed with our
// updater key), tells the user when a newer version exists, and installs it on request. The
// Microsoft Store build is updated by the Store, so it never checks.
import { check, type Update } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'error';

const EVERY = 6 * 60 * 60 * 1000;

class Updates {
  status = $state<UpdateStatus>('idle');
  version = $state('');
  notes = $state('');
  progress = $state(0); // 0..1 while downloading
  error = $state('');
  /** "Later" hides the banner until the next check finds the update again. */
  dismissed = $state(false);
  store = $state(false);
  private update: Update | null = null;
  private started = false;

  get showBanner() {
    return (
      (this.status === 'available' && !this.dismissed) ||
      this.status === 'downloading' ||
      this.status === 'installing' ||
      (this.status === 'error' && !!this.update)
    );
  }

  start() {
    if (this.started) return;
    this.started = true;
    setTimeout(() => this.check(), 8000);
    setInterval(() => this.check(), EVERY);
  }

  async check(manual = false) {
    if (this.status === 'downloading' || this.status === 'installing' || this.status === 'checking') return;
    this.store = (await invoke<string>('install_kind').catch(() => 'direct')) === 'store';
    if (this.store) {
      if (manual) this.status = 'none';
      return;
    }
    this.status = 'checking';
    this.error = '';
    try {
      const u = await check({ timeout: 15_000 });
      this.update = u;
      if (u) {
        if (u.version !== this.version || manual) this.dismissed = false;
        this.version = u.version;
        this.notes = u.body ?? '';
        this.status = 'available';
      } else {
        this.status = 'none';
      }
    } catch (e) {
      // Background checks fail quietly (offline, server busy); a manual check says why.
      this.status = manual ? 'error' : 'idle';
      this.error = manual ? `Couldn't check for updates: ${String((e as Error)?.message ?? e)}` : '';
    }
  }

  /** Download and install. On Windows the installer takes over, then reopens Glint. */
  async install(beforeInstall: () => Promise<void>) {
    if (!this.update) return;
    let total = 0;
    let received = 0;
    this.status = 'downloading';
    this.progress = 0;
    this.error = '';
    try {
      await beforeInstall();
      await this.update.downloadAndInstall((ev) => {
        if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
        else if (ev.event === 'Progress') {
          received += ev.data.chunkLength;
          if (total) this.progress = Math.min(1, received / total);
        } else if (ev.event === 'Finished') this.status = 'installing';
      });
      this.status = 'installing';
    } catch (e) {
      this.status = 'error';
      this.error = `Update failed: ${String((e as Error)?.message ?? e)}`;
    }
  }
}

export const updates = new Updates();
