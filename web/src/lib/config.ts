import * as publicEnv from '$env/static/public';

// Namespace import so unset variables resolve to undefined instead of failing the build.
const env = publicEnv as Record<string, string | undefined>;

const clean = (v: string | undefined) => (v ?? '').trim();

export const API_URL = (clean(env.PUBLIC_API_URL) || 'http://localhost:8787').replace(/\/+$/, '');
export const GOOGLE_CLIENT_ID = clean(env.PUBLIC_GOOGLE_CLIENT_ID);
export const DOWNLOAD_URL = clean(env.PUBLIC_DOWNLOAD_URL);
export const DEV_LOGIN = clean(env.PUBLIC_DEV_LOGIN) === '1';
export const BRAND = clean(env.PUBLIC_BRAND_NAME) || 'Glint';
export const SUPPORT_EMAIL = clean(env.PUBLIC_SUPPORT_EMAIL) || 'support@example.com';
