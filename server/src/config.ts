const env = process.env;

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v !== undefined ? Math.trunc(n) : d;
};

const webUrl = (env.WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '');

export const config = {
  port: int(env.PORT, 8787),
  // '::' = dual-stack, so "localhost" (which Windows resolves to ::1 first) connects instantly.
  host: env.HOST ?? '::',
  isProd: env.NODE_ENV === 'production',
  brand: env.BRAND_NAME ?? 'Glint',
  // PostgreSQL connection string, e.g. from VibeDB: `vibedb project credentials glint --role owner`.
  databaseUrl: env.DATABASE_URL ?? '',
  dbPoolSize: int(env.DB_POOL_SIZE, 10),
  // Day boundaries for admin stats.
  timezone: env.TZ_STATS ?? 'Asia/Kolkata',
  webUrl,
  corsOrigins: list(env.CORS_ORIGINS).length ? list(env.CORS_ORIGINS) : [webUrl],
  trustProxy: env.TRUST_PROXY !== '0',

  googleClientIds: list(env.GOOGLE_CLIENT_ID),
  devLogin: env.DEV_LOGIN === '1',
  adminEmails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
  sessionDays: int(env.SESSION_DAYS, 60),

  openaiKey: env.OPENAI_API_KEY ?? '',
  openaiBase: (env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
  mockAI: env.MOCK_AI === '1',

  // Models users can pick in the app (see models.ts), and the default.
  allowedModels: list(env.ALLOWED_MODELS).length
    ? list(env.ALLOWED_MODELS)
    : ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol'],
  defaultModel: env.DEFAULT_MODEL ?? 'gpt-6-luna',
  // 'priority' = OpenAI's low-latency lane: ~0.6 s first token vs ~0.8 s with load spikes on default.
  serviceTier: env.OPENAI_SERVICE_TIER ?? 'priority',
  maxOutputTokens: int(env.MAX_OUTPUT_TOKENS, 1400),

  // Speech-to-text. "them" (system audio) gets the streaming model for live captions;
  // "you" (mic) only needs context, so it uses the cheaper committed-turn model.
  sttThem: env.STT_MODEL_THEM ?? 'gpt-live-transcribe',
  sttYou: env.STT_MODEL_YOU ?? 'gpt-transcribe',
  sttDelay: env.STT_DELAY ?? 'low',
  // Used per finished utterance when realtime transcription isn't available to the project.
  sttRestModel: env.STT_REST_MODEL ?? 'gpt-transcribe',
  sttLanguages: list(env.STT_LANGUAGES),

  trialSeconds: int(env.TRIAL_SECONDS, 20 * 60),
  answerSeconds: int(env.ANSWER_SECONDS, 30),
  idleTimeoutS: int(env.IDLE_TIMEOUT_S, 300),
  validityDays: int(env.VALIDITY_DAYS, 180),

  // Public URL of this API (for payment webhooks), e.g. https://glint-api.strophic.in
  publicApiUrl: (env.PUBLIC_API_URL ?? '').replace(/\/$/, ''),

  cashfree: {
    appId: env.CASHFREE_APP_ID ?? '',
    secretKey: env.CASHFREE_SECRET_KEY ?? '',
    env: (env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox') as 'production' | 'sandbox',
    apiVersion: env.CASHFREE_API_VERSION ?? '2026-01-01',
    baseUrl: (env.CASHFREE_BASE_URL ?? '').replace(/\/$/, ''), // tests only
  },
};

export const aiConfigured = () => config.mockAI || !!config.openaiKey;
