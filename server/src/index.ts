import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config, aiConfigured } from './config.js';
import { closeDb, migrate, sql } from './db.js';
import { authRoutes } from './auth.js';
import { billingRoutes } from './billing.js';
import { answerRoutes } from './answer.js';
import { listenRoutes } from './listen.js';
import { adminRoutes } from './admin.js';
import { accountRoutes } from './account.js';
import { loadRuntime } from './runtime.js';
import { closeAllLive } from './live-registry.js';
import { HttpError } from './util.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  trustProxy: config.trustProxy,
  bodyLimit: 1024 * 1024,
});

// Keep the raw body (Razorpay webhook signatures are computed over it).
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  (req as any).rawBody = body;
  if (!body) return done(null, {});
  try {
    done(null, JSON.parse(body as string));
  } catch {
    done(new HttpError(400, 'bad_request', 'Invalid JSON.'), undefined);
  }
});

await app.register(cors, {
  origin: config.corsOrigins,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type'],
  maxAge: 86400,
});
await app.register(websocket, { options: { maxPayload: 256 * 1024 } });

app.setErrorHandler((err, req, reply) => {
  if (err instanceof HttpError) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  const e = err as { statusCode?: number; message?: string };
  const status = e.statusCode ?? 500;
  if (status >= 500) req.log.error(err);
  reply.code(status).send({
    error: status === 413 ? 'too_large' : status < 500 ? 'bad_request' : 'internal',
    message: status < 500 ? (e.message ?? 'Bad request') : 'Something went wrong.',
  });
});

await migrate();

// Health includes a DB round trip so the load balancer / Docker notice a dead database.
app.get('/health', async (_req, reply) => {
  try {
    await sql`SELECT 1`;
  } catch {
    return reply.code(503).send({ ok: false, db: false });
  }
  return { ok: true, ai: aiConfigured(), mock: config.mockAI };
});

await app.register(authRoutes);
await app.register(billingRoutes);
await app.register(answerRoutes);
await app.register(listenRoutes);
await app.register(adminRoutes);
await app.register(accountRoutes);
await loadRuntime();

if (!aiConfigured()) app.log.warn('OPENAI_API_KEY is not set and MOCK_AI is off: AI endpoints will return 503.');
if (config.mockAI) app.log.warn('MOCK_AI=1: answers and transcripts are simulated.');
if (config.devLogin && config.isProd) app.log.warn('DEV_LOGIN=1 in production. Anyone can sign in as any email!');

const shutdown = async () => {
  closeAllLive();
  await app.close();
  await closeDb();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
