import * as publicEnv from '$env/static/public';

// Namespace import so unset variables resolve to undefined instead of failing the build.
const env = publicEnv as Record<string, string | undefined>;

const clean = (v: string | undefined) => (v ?? '').trim();

export const API_URL = (clean(env.PUBLIC_API_URL) || 'http://localhost:8787').replace(/\/+$/, '');
export const GOOGLE_CLIENT_ID = clean(env.PUBLIC_GOOGLE_CLIENT_ID);
/** The direct installer (secondary to the Store); defaults to the one the API serves. */
export const DOWNLOAD_URL =
  clean(env.PUBLIC_DOWNLOAD_URL) || (API_URL.startsWith('https://') ? `${API_URL}/downloads/Glint-Setup.exe` : '');
/** The Microsoft Store listing: the main way to install (signed by Microsoft, no browser warnings, Store updates). */
export const STORE_URL = clean(env.PUBLIC_STORE_URL) || 'https://apps.microsoft.com/detail/9PMXB30Z4SVF';
export const DEV_LOGIN = clean(env.PUBLIC_DEV_LOGIN) === '1';
export const BRAND = clean(env.PUBLIC_BRAND_NAME) || 'Glint';
export const SUPPORT_EMAIL = clean(env.PUBLIC_SUPPORT_EMAIL) || 'hafeez@strophic.in';
