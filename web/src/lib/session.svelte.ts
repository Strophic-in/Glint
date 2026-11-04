import { ApiError, api, getToken, setToken, type Me } from './api';

class Session {
  me = $state<Me | null>(null);
  /** True until the first /v1/me attempt finishes (or we know there is no token). */
  loading = $state(true);
  signedIn = $derived(this.me !== null);

  #started = false;

  /** Call once on the client (root layout onMount). Safe to call repeatedly. */
  async init() {
    if (this.#started) return;
    this.#started = true;
    if (!getToken()) {
      this.loading = false;
      return;
    }
    await this.refresh();
  }

  async refresh() {
    if (!getToken()) {
      this.me = null;
      this.loading = false;
      return;
    }
    try {
      this.me = await api.me();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        this.me = null;
      }
      // Network errors keep whatever we had; callers can surface the error.
    } finally {
      this.loading = false;
    }
  }

  async #adopt(token: string) {
    setToken(token);
    this.me = await api.me();
    this.loading = false;
  }

  async loginWithGoogle(credential: string) {
    const res = await api.loginGoogle(credential);
    await this.#adopt(res.token);
  }

  async loginDev(email: string) {
    const res = await api.loginDev(email);
    await this.#adopt(res.token);
  }

  async logout() {
    try {
      if (getToken()) await api.logout();
    } catch {
      /* token may already be invalid — clear locally regardless */
    }
    setToken(null);
    this.me = null;
    try {
      window.google?.accounts.id.disableAutoSelect();
    } catch {
      /* GIS not loaded */
    }
  }
}

export const session = new Session();
