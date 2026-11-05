// End-to-end smoke test. Run a server with MOCK_AI=1 DEV_LOGIN=1, then: node test/smoke.mjs
import WebSocket from 'ws';
import http from 'node:http';

// Minimal Cashfree PG mock: create order, get order, and a helper to mark one paid.
const CF = { orders: new Map(), calls: 0 };
const cfMock = http
  .createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.headers['x-client-id'] !== 'test_app' || req.headers['x-client-secret'] !== 'test_secret' || !req.headers['x-api-version']) {
      return send(401, { message: 'authentication failed' });
    }
    if (req.method === 'POST' && req.url === '/pg/orders') {
      const o = JSON.parse(body);
      CF.calls++;
      if (!/^\d{10}$/.test(o.customer_details?.customer_phone ?? '')) return send(400, { message: 'customer_phone invalid' });
      const order = { order_id: o.order_id, cf_order_id: 5000 + CF.calls, order_amount: o.order_amount, order_status: 'ACTIVE', payment_session_id: `session_${o.order_id}`, customer_phone: o.customer_details.customer_phone };
      CF.orders.set(o.order_id, order);
      return send(200, order);
    }
    const m = /^\/pg\/orders\/([^/?]+)$/.exec(req.url ?? '');
    if (req.method === 'GET' && m) {
      const o = CF.orders.get(decodeURIComponent(m[1]));
      return o ? send(200, o) : send(404, { message: 'order not found' });
    }
    send(404, { message: 'no route' });
  })
  .listen(8799);
const cfPay = (orderId, amount) => {
  const o = CF.orders.get(orderId);
  o.order_status = 'PAID';
  if (amount !== undefined) o.order_amount = amount;
};

const API = process.env.API ?? 'http://localhost:8787';
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};
const j = async (path, { token, body, method } = {}) => {
  const res = await fetch(API + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const health = await j('/health');
ok(health.status === 200 && health.data.mock, 'health ok (mock mode)');

const email = `smoke+${Date.now()}@example.com`;
const login = await j('/v1/auth/dev', { body: { email } });
ok(login.status === 200 && login.data.token, 'dev login');
const web = login.data.token;

const me = await j('/v1/me', { token: web });
ok(me.data.balance_seconds === me.data.trial_seconds, `trial credited (${me.data.balance_seconds}s)`);
ok((await j('/v1/me')).status === 401, 'me without token → 401');

const plans = await j('/v1/plans');
ok(plans.data.plans.find((p) => p.id === 'pro')?.price_inr === 1499, 'plans list has Pro ₹1499');

// Device flow: desktop starts, browser approves, desktop polls.
const start = await j('/v1/auth/device/start', { body: {} });
ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(start.data.user_code), `device code ${start.data.user_code}`);
ok((await j('/v1/auth/device/poll', { body: { device_code: start.data.device_code } })).data.status === 'pending', 'poll pending');
ok((await j(`/v1/auth/device/info?user_code=${start.data.user_code.toLowerCase().replace('-', '')}`)).status === 200, 'device info accepts sloppy code');
ok((await j('/v1/auth/device/approve', { token: web, body: { user_code: start.data.user_code } })).data.ok, 'approve');
const polled = await j('/v1/auth/device/poll', { body: { device_code: start.data.device_code } });
ok(polled.data.status === 'approved' && polled.data.token, 'poll approved → desktop token');
ok((await j('/v1/auth/device/poll', { body: { device_code: start.data.device_code } })).status === 410, 'device code single-use');
const desk = polled.data.token;

// Answer (not live → costs ANSWER_SECONDS).
const before = (await j('/v1/me', { token: desk })).data.balance_seconds;
const t0 = Date.now();
const res = await fetch(API + '/v1/answer', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${desk}` },
  body: JSON.stringify({ action: 'answer', tier: 'balanced', transcript: [{ who: 'them', text: 'Tell me about yourself?' }], profile: { mode: 'interview' } }),
});
let text = '';
let firstTokenMs = 0;
let doneEvt = null;
const dec = new TextDecoder();
let buf = '';
for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true });
  let i;
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const block = buf.slice(0, i);
    buf = buf.slice(i + 2);
    const ev = /event: (\w+)/.exec(block)?.[1];
    const data = JSON.parse(/data: (.*)/.exec(block)?.[1] ?? 'null');
    if (ev === 'delta') {
      if (!firstTokenMs) firstTokenMs = Date.now() - t0;
      text += data.t;
    }
    if (ev === 'done') doneEvt = data;
  }
}
ok(text.includes('**Say:**') && doneEvt, `answer streamed (${text.length} chars, first token ${firstTokenMs} ms)`);
ok(doneEvt?.balance_seconds === before - 30, `answer charged 30s (${before} → ${doneEvt?.balance_seconds})`);

// End-of-session review: free, reads the whole session, and is rate limited.
{
  const body = JSON.stringify({ action: 'summary', transcript: [{ who: 'them', text: 'Why this company?' }, { who: 'you', text: 'Because of the mission.' }], profile: { mode: 'interview' } });
  const send = () => fetch(API + '/v1/answer', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${desk}` }, body });
  const r = await send();
  const out = await r.text();
  ok(r.status === 200 && /event: done/.test(out), 'session review streamed');
  const after = (await j('/v1/me', { token: desk })).data.balance_seconds;
  ok(after === doneEvt?.balance_seconds, `session review is free (${doneEvt?.balance_seconds} → ${after})`);
  const codes = []; // 4 per hour: the 5th request in a row is refused
  for (let i = 0; i < 4; i++) {
    const x = await send();
    codes.push(x.status);
    await x.text();
  }
  ok(codes.join(',') === '200,200,200,429', `session reviews are rate limited (${codes.join(',')})`);
}

// Live session: stream fake speech, commit, expect delta + final.
const events = await new Promise((resolve) => {
  const got = [];
  const ws = new WebSocket(API.replace('http', 'ws') + '/v1/listen', { headers: { authorization: `Bearer ${desk}` } });
  ws.on('message', (m) => {
    const e = JSON.parse(m.toString());
    got.push(e);
    if (e.type === 'ready') {
      ws.send(JSON.stringify({ type: 'start', language: 'en' }));
      const pcm = Buffer.alloc(4800 * 2);
      for (let k = 0; k < 3; k++) ws.send(Buffer.concat([Buffer.from([1]), pcm]));
      ws.send(JSON.stringify({ type: 'commit', src: 'them' }));
    }
    if (e.type === 'final') {
      ws.send(JSON.stringify({ type: 'stop' }));
    }
  });
  ws.on('close', () => resolve(got));
  setTimeout(() => ws.close(), 8000);
});
ok(events[0]?.type === 'ready', 'listen ready');
ok(events.some((e) => e.type === 'delta' && e.src === 'them'), 'listen delta (them)');
const fin = events.find((e) => e.type === 'final');
ok(fin?.src === 'them' && fin.text.length > 10, `listen final: "${fin?.text}"`);

// Answers are free while live.
const live = await new Promise((resolve) => {
  const ws = new WebSocket(API.replace('http', 'ws') + '/v1/listen', { headers: { authorization: `Bearer ${desk}` } });
  ws.on('message', async (m) => {
    if (JSON.parse(m.toString()).type !== 'ready') return;
    const me1 = (await j('/v1/me', { token: desk })).data;
    const r = await fetch(API + '/v1/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${desk}` },
      body: JSON.stringify({ action: 'shorter' }),
    });
    const body = await r.text();
    const done = JSON.parse(/event: done\ndata: (.*)/.exec(body)?.[1] ?? 'null');
    ws.close();
    resolve({ live: me1.live, before: me1.balance_seconds, after: done?.balance_seconds });
  });
});
ok(live.live === true, 'me.live true during session');
ok(live.after >= live.before - 1, `answer free while live (${live.before} → ${live.after})`);

// Second session replaces the first.
const replaced = await new Promise((resolve) => {
  const a = new WebSocket(API.replace('http', 'ws') + '/v1/listen', { headers: { authorization: `Bearer ${desk}` } });
  a.on('message', (m) => {
    const e = JSON.parse(m.toString());
    if (e.type === 'ready') {
      const b = new WebSocket(API.replace('http', 'ws') + '/v1/listen', { headers: { authorization: `Bearer ${web}` } });
      b.on('message', (m2) => JSON.parse(m2.toString()).type === 'ready' && setTimeout(() => b.close(), 100));
    }
    if (e.type === 'error') resolve(e.error);
  });
  setTimeout(() => resolve('timeout'), 5000);
});
ok(replaced === 'replaced', 'second device replaces first session');

const bad = await new Promise((resolve) => {
  const ws = new WebSocket(API.replace('http', 'ws') + '/v1/listen', { headers: { authorization: 'Bearer nope' } });
  ws.on('unexpected-response', (_req, r) => resolve(r.statusCode));
  ws.on('open', () => resolve('opened'));
});
ok(bad === 401, `listen with bad token → ${bad}`);

// Caption language: ?lang= picks the transcription language(s) for the session.
{
  const readyLangs = (query) =>
    new Promise((resolve) => {
      const ws = new WebSocket(API.replace('http', 'ws') + '/v1/listen' + query, { headers: { authorization: `Bearer ${desk}` } });
      ws.on('message', (m) => {
        const e = JSON.parse(m.toString());
        if (e.type === 'ready') {
          resolve(JSON.stringify(e.languages));
          ws.close();
        }
      });
      ws.on('error', () => resolve('error'));
      setTimeout(() => resolve('timeout'), 5000);
    });
  ok((await readyLangs('')) === '["en"]', 'no lang param → English');
  ok((await readyLangs('?lang=en,HI')) === '["en","hi"]', 'lang=en,hi');
  ok((await readyLangs('?lang=auto')) === '"auto"', 'lang=auto → auto-detect');
  ok((await readyLangs('?lang=english')) === '["en"]', 'invalid lang → English');

  // Pure helpers from the built server (they need a DATABASE_URL only to load; nothing connects).
  process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:1/unused';
  const L = await import('../dist/listen.js');
  ok(JSON.stringify(L.parseLangs('en,ta,te,hi')) === '["en"]' && JSON.stringify(L.parseLangs(undefined)) === '["en"]', 'lang parsing caps at 3 codes, defaults to en');
  ok(L.mostlyNonLatin('这是一个测试') && L.mostlyNonLatin('यह एक परीक्षण है') && L.mostlyNonLatin('Привет, как дела'), 'non-Latin captions detected');
  ok(!L.mostlyNonLatin('Tell me about yourself.') && !L.mostlyNonLatin('Café résumé, naïve') && !L.mostlyNonLatin('123 ...') && !L.mostlyNonLatin('Use React 是'), 'Latin captions kept');
  ok(L.latinOnly(['en']) && L.latinOnly(['en', 'es']) && !L.latinOnly(['en', 'hi']) && !L.latinOnly(null), 'script guard only when every language is Latin-script');
  ok(L.langPrompt(['en']) === 'English conversation on a call. Transcribe in English only.' && L.langPrompt(null) === undefined, `language prompt (${L.langPrompt(['en', 'hi'])})`);
}

ok((await j('/v1/billing/order', { token: web, body: { plan_id: 'nope' } })).status === 400, 'order rejects unknown plans');
ok((await j('/v1/billing/webhook', { body: { event: 'payment.captured' } })).status === 400, 'webhook rejects bad signature');
ok((await j('/v1/admin/grant', { token: web, body: { email, seconds: 60 } })).status === 403, 'non-admin cannot grant');

// ── Payments via Cashfree (mock server on :8799; API must run with CASHFREE_BASE_URL pointing at it) ──
if (process.env.CASHFREE_MOCK === '1') {
  const { createHmac } = await import('node:crypto');
  const meOf = async (t) => (await j('/v1/me', { token: t })).data;
  const verify = (t, id) => j('/v1/billing/verify', { token: t, body: { order_id: id } });
  // Live sessions closed by earlier tests post their final (rounded-up) charge asynchronously.
  await new Promise((r) => setTimeout(r, 1500));

  const noPhone = await j('/v1/billing/order', { token: desk, body: { plan_id: 'pro' } });
  ok(noPhone.status === 400 && noPhone.data.error === 'phone_required', 'checkout asks for a mobile number first');
  const o1 = await j('/v1/billing/order', { token: desk, body: { plan_id: 'pro', phone: '+91 98765 43210' } });
  ok(o1.status === 200 && o1.data.payment_session_id && o1.data.amount_paise === 149900, `Cashfree order created (₹${o1.data.amount_paise / 100})`);
  ok(CF.orders.get(o1.data.order_id)?.customer_phone === '9876543210', 'phone normalised to 10 digits for Cashfree');
  const bal0 = (await meOf(desk)).balance_seconds;
  const pending = await verify(desk, o1.data.order_id);
  ok(pending.data.ok === false && pending.data.status === 'active', 'unpaid order is not credited');
  cfPay(o1.data.order_id);
  const v1 = await verify(desk, o1.data.order_id);
  ok(v1.data.ok && v1.data.balance_seconds === bal0 + 25200, `paid order credits 7 h (${bal0} → ${v1.data.balance_seconds})`);
  ok((await verify(desk, o1.data.order_id)).data.balance_seconds === bal0 + 25200, 'verifying again does not double-credit');
  ok((await meOf(desk)).expires_at > Date.now() + 179 * 86_400_000, 'purchase sets 180-day validity');

  const o2 = await j('/v1/billing/order', { token: desk, body: { plan_id: 'pro' } });
  ok(o2.status === 200, 'mobile number is remembered for the next purchase');
  cfPay(o2.data.order_id);
  const hook = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: o2.data.order_id }, payment: { payment_status: 'SUCCESS' } } });
  const ts = String(Date.now());
  const sig = createHmac('sha256', 'test_secret').update(ts + hook).digest('base64');
  const post = (s) => fetch(API + '/v1/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-timestamp': ts, 'x-webhook-signature': s }, body: hook });
  ok((await post('bad' + sig.slice(3))).status === 400, 'webhook rejects a forged signature');
  ok((await post(sig)).status === 200 && (await meOf(desk)).balance_seconds === bal0 + 50400, 'signed webhook credits the order');
  await post(sig);
  ok((await meOf(desk)).balance_seconds === bal0 + 50400, 'webhook replay does not double-credit');

  const o3 = await j('/v1/billing/order', { token: desk, body: { plan_id: 'starter' } });
  cfPay(o3.data.order_id, 1); // Cashfree says PAID, but for ₹1 instead of ₹499
  ok((await verify(desk, o3.data.order_id)).data.ok === false && (await meOf(desk)).balance_seconds === bal0 + 50400, 'tampered amount is never credited');

  // ── Coupons ──
  const admin = (await j('/v1/auth/dev', { body: { email: 'admin@example.com' } })).data.token;
  const coupon = (body) => j('/v1/admin/coupons', { token: admin, body });
  ok((await j('/v1/admin/coupons', { token: desk, body: { code: 'NOPE', kind: 'percent', value: 10 } })).status === 403, 'only admins create coupons');
  ok((await coupon({ code: 'save20', kind: 'percent', value: 20, note: 'launch' })).data?.ok, 'admin creates SAVE20 (20% off)');
  ok((await coupon({ code: 'SAVE20', kind: 'percent', value: 10 })).status === 409, 'duplicate code rejected');
  const pv = await j('/v1/billing/coupon', { token: desk, body: { code: ' save20 ' } });
  ok(pv.data.label === '20% off' && pv.data.plans.find((p) => p.plan_id === 'pro').final_paise === 119920, 'coupon preview: Pro ₹1,499 → ₹1,199.20');
  const balA = (await meOf(desk)).balance_seconds;
  const oc = await j('/v1/billing/order', { token: desk, body: { plan_id: 'pro', coupon: 'SAVE20' } });
  ok(oc.data.amount_paise === 119920 && CF.orders.get(oc.data.order_id).order_amount === 1199.2, 'discounted amount sent to Cashfree');
  cfPay(oc.data.order_id);
  ok((await verify(desk, oc.data.order_id)).data.balance_seconds === balA + 25200, 'coupon order credits full 7 h');
  const list = (await j('/v1/admin/coupons', { token: admin })).data.coupons;
  const save20 = list.find((c) => c.code === 'SAVE20');
  ok(save20.uses === 1 && save20.discount_total_paise === 29980, `admin sees uses (${save20.uses}) and discount given (₹${save20.discount_total_paise / 100})`);
  const reuse = await j('/v1/billing/coupon', { token: desk, body: { code: 'SAVE20' } });
  ok(reuse.status === 400 && /already used/.test(reuse.data.message), 'once-per-user coupons cannot be reused');

  ok((await coupon({ code: 'FLAT100', kind: 'flat', value: 10000, plan_ids: ['starter'] })).data?.ok, 'admin creates FLAT100 (₹100 off Starter only)');
  const pf = await j('/v1/billing/coupon', { token: desk, body: { code: 'FLAT100' } });
  const st = pf.data.plans.find((p) => p.plan_id === 'starter');
  ok(st.eligible && st.final_paise === 39900 && !pf.data.plans.find((p) => p.plan_id === 'pro').eligible, 'plan-limited coupon applies to Starter only');
  ok((await j('/v1/billing/order', { token: desk, body: { plan_id: 'pro', coupon: 'FLAT100' } })).status === 400, 'plan-limited coupon refused on Pro');

  ok((await coupon({ code: 'FREE100', kind: 'percent', value: 100, max_uses: 1 })).data?.ok, 'admin creates FREE100 (100% off, 1 use)');
  const calls = CF.calls;
  const balB = (await meOf(desk)).balance_seconds;
  const free = await j('/v1/billing/order', { token: desk, body: { plan_id: 'starter', coupon: 'FREE100' } });
  ok(free.data.free === true && free.data.balance_seconds === balB + 7200 && CF.calls === calls, '100% coupon credits instantly without Cashfree');
  const other = (await j('/v1/auth/dev', { body: { email: `other+${Date.now()}@example.com` } })).data.token;
  const full = await j('/v1/billing/coupon', { token: other, body: { code: 'FREE100' } });
  ok(full.status === 400 && /fully used/.test(full.data.message), 'max-uses cap enforced');

  ok((await j('/v1/admin/coupons/FLAT100', { token: admin, body: { active: false } })).data?.ok, 'admin disables FLAT100');
  ok((await j('/v1/billing/coupon', { token: desk, body: { code: 'FLAT100' } })).status === 400, 'disabled coupon rejected');
  ok((await j('/v1/admin/coupons/FLAT100', { token: admin, method: 'DELETE' })).data?.ok, 'admin deletes FLAT100');
  ok((await j('/v1/admin/coupons', { token: admin })).data.coupons.every((c) => c.code !== 'FLAT100'), 'deleted coupon gone from the list');

  // Public offers: only coupons marked public (and usable) are advertised, with the admin's text.
  ok((await coupon({ code: 'DIWALI30', kind: 'percent', value: 30, public: true, public_text: 'Diwali Sale: 30% off' })).data?.ok, 'admin creates a public coupon');
  const pub = (await j('/v1/coupons/public', {})).data?.coupons ?? [];
  const diwali = pub.find((c) => c.code === 'DIWALI30');
  ok(diwali?.text === 'Diwali Sale: 30% off' && diwali?.label === '30% off', 'public coupon listed with its banner text');
  ok(pub.length > 0 && !pub.some((c) => c.code === 'SAVE20'), 'private coupons are not advertised');
  await j('/v1/admin/coupons/DIWALI30', { token: admin, body: { public: false } });
  ok(!((await j('/v1/coupons/public', {})).data?.coupons ?? []).some((c) => c.code === 'DIWALI30'), 'hiding a coupon removes it from the website right away');
}

// ── Account self-service ──
{
  const acct = `acct+${Date.now()}@example.com`;
  const t1 = (await j('/v1/auth/dev', { body: { email: acct } })).data.token;
  const t2 = (await j('/v1/auth/dev', { body: { email: acct } })).data.token;
  const s = (await j('/v1/account/sessions', { token: t1 })).data.sessions;
  ok(s.length === 2 && s.filter((x) => x.current).length === 1, 'account lists signed-in devices (current marked)');
  ok((await j('/v1/account/sessions/revoke', { token: t1, body: { all_others: true } })).data.revoked === 1 && (await j('/v1/me', { token: t2 })).status === 401, 'sign out of all other devices');
  await j('/v1/account/profile', { token: t1, body: { name: 'Priya S', phone: '09876543210' } });
  const prof = (await j('/v1/me', { token: t1 })).data.user;
  ok(prof.name === 'Priya S' && prof.phone === '9876543210', 'profile name and mobile updated');
  ok((await j('/v1/account/delete', { token: t1, body: { confirm_email: 'wrong@example.com' } })).status === 400, 'delete needs the exact email');
  ok((await j('/v1/account/delete', { token: t1, body: { confirm_email: acct } })).data.ok && (await j('/v1/me', { token: t1 })).status === 401, 'account deleted and signed out');
  const again = (await j('/v1/auth/dev', { body: { email: acct } })).data.token;
  ok((await j('/v1/me', { token: again })).data.balance_seconds === 0, 'signing up again does not grant a second free trial');
}

// Admin panel API (server must run with ADMIN_EMAILS=admin@example.com).
{
  const admin = (await j('/v1/auth/dev', { body: { email: 'admin@example.com' } })).data.token;
  const victimEmail = `victim+${Date.now()}@example.com`;
  const victim = (await j('/v1/auth/dev', { body: { email: victimEmail } })).data.token;
  const victimId = (await j('/v1/me', { token: victim })).data.user.id;
  ok((await j('/v1/me', { token: admin })).data.is_admin === true, 'admin flagged in /v1/me');
  ok((await j('/v1/admin/stats', { token: victim })).status === 403, 'non-admin → admin API 403');
  const stats = await j('/v1/admin/stats', { token: admin });
  ok(stats.status === 200 && stats.data.users_total >= 3 && stats.data.daily.length === 14, `admin stats (${stats.data.users_total} users)`);
  const found = await j(`/v1/admin/users?q=${encodeURIComponent('victim+')}`, { token: admin });
  ok(found.data.users.some((u) => u.id === victimId), 'admin user search');

  const add = await j(`/v1/admin/users/${victimId}/time`, { token: admin, body: { seconds: 600, note: 'promo' } });
  ok(add.data.balance_seconds === 1800, `add 10 min (${add.data.balance_seconds}s)`);
  const sub = await j(`/v1/admin/users/${victimId}/time`, { token: admin, body: { seconds: -300 } });
  ok(sub.data.balance_seconds === 1500, `deduct 5 min (${sub.data.balance_seconds}s)`);
  const left = sub.data.balance_seconds;
  const over = await j(`/v1/admin/users/${victimId}/time`, { token: admin, body: { seconds: -100000 } });
  ok(over.data.balance_seconds === 0 && over.data.removed_seconds === left, `over-deduct stops at zero (removed ${over.data.removed_seconds}s)`);
  await j(`/v1/admin/users/${victimId}/time`, { token: admin, body: { seconds: 240 } });
  const all = await j(`/v1/admin/users/${victimId}/time`, { token: admin, body: { all: true, note: 'abuse' } });
  ok(all.data.balance_seconds === 0 && all.data.removed_seconds === 240, `remove all time (${all.data.removed_seconds}s)`);
  ok((await j(`/v1/admin/users/${victimId}/time`, { token: admin, body: { all: true } })).status === 400, 'remove all with nothing left → 400');
  const hist = (await j(`/v1/admin/users/${victimId}`, { token: admin })).data.credits;
  ok(hist.some((c) => c.seconds === -left) && hist.some((c) => c.seconds === -240), 'time history records what was actually removed');
  ok((await j('/v1/admin/log', { token: admin })).data.log.some((l) => l.action === 'remove_all_time'), 'remove-all is audited');

  ok((await j(`/v1/admin/users/${victimId}/block`, { token: admin, body: { reason: 'Abuse' } })).data.ok, 'block');
  const blocked = await j('/v1/me', { token: victim });
  ok(blocked.status === 403 && blocked.data.error === 'account_blocked' && blocked.data.message === 'Abuse', 'blocked user rejected with reason');
  const ws = await new Promise((resolve) => {
    const s = new WebSocket(API.replace('http', 'ws') + '/v1/listen', { headers: { authorization: `Bearer ${victim}` } });
    s.on('unexpected-response', (_q, r) => resolve(r.statusCode));
    s.on('open', () => resolve('opened'));
  });
  ok(ws === 403, `blocked user can't go live (${ws})`);
  ok((await j(`/v1/admin/users/${victimId}/unblock`, { token: admin, body: {} })).data.ok && (await j('/v1/me', { token: victim })).status === 200, 'unblock restores access');

  await j('/v1/admin/config', { token: admin, body: { maintenance: true, maintenance_message: 'Back soon' } });
  const m = await fetch(API + '/v1/answer', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${victim}` }, body: '{}' });
  ok(m.status === 503 && (await m.json()).message === 'Back soon', 'maintenance blocks users');
  const ma = await fetch(API + '/v1/answer', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin}` }, body: '{}' });
  ok(ma.status === 200, 'admins bypass maintenance');
  await ma.text();
  await j('/v1/admin/config', { token: admin, body: { maintenance: false, signups_open: false } });
  ok((await j('/v1/auth/dev', { body: { email: `new+${Date.now()}@example.com` } })).status === 403, 'signups closed blocks new accounts');
  ok((await j('/v1/auth/dev', { body: { email: victimEmail } })).status === 200, 'existing users can still sign in');
  const cfg = await j('/v1/admin/config', { token: admin, body: { signups_open: true, trial_seconds: 900 } });
  ok(cfg.data.config.trial_seconds === 900 && cfg.data.config.signups_open === true, 'runtime config update');

  ok((await j(`/v1/admin/users/${victimId}/logout`, { token: admin, body: {} })).data.ok && (await j('/v1/me', { token: victim })).status === 401, 'force logout');
  const log = await j('/v1/admin/log', { token: admin });
  ok(log.data.log.some((l) => l.action === 'block') && log.data.log.some((l) => l.action === 'config'), `audit log (${log.data.log.length} entries)`);
}

const usage = await j('/v1/usage', { token: web });
ok(usage.data.usage.some((u) => u.kind === 'live') && usage.data.usage.some((u) => u.kind === 'answer'), 'usage history recorded');

// AI cost tracking: price maths (built server), then what the admin panel gets.
{
  const { answerCostMicros, sttCostMicros } = await import('../dist/pricing.js');
  ok(answerCostMicros({ model: 'gpt-6-luna', tier: 'default', input: 1e6, output: 1e6 }) === 600_000, 'luna: 1M in + 1M out = $0.60');
  ok(answerCostMicros({ model: 'gpt-6-luna', tier: 'priority', input: 1e6, output: 1e6 }) === 1_200_000, 'priority lane costs 2x');
  ok(answerCostMicros({ model: 'gpt-6.1-sol', input: 1e6, cached: 1e6, output: 0 }) === 100_000, 'cached input billed at the cached rate');
  ok(answerCostMicros({ model: 'mystery-model', input: 1e6 }) === 1_000_000, 'unknown model priced like gpt-6.1-terra');
  ok(sttCostMicros('gpt-live-transcribe', 60) === 17_000 && sttCostMicros('gpt-transcribe', 120) === 9_000, 'transcription priced per audio minute');
  ok(answerCostMicros({ model: 'mock', input: 1e6, output: 1e6 }) === 0, 'mock answers are free');

  const admin = (await j('/v1/auth/dev', { body: { email: 'admin@example.com' } })).data.token;
  const meId = (await j('/v1/me', { token: web })).data.user.id;
  const detail = (await j(`/v1/admin/users/${meId}`, { token: admin })).data;
  const t = detail.totals;
  ok(t && t.sessions >= 1 && t.answers >= 1, `user totals (${t?.sessions} sessions, ${t?.answers} answers)`);
  ok(t.audio_ms >= 600, `audio sent to transcription measured (${t.audio_ms} ms)`);
  ok(['stt_cost_micros', 'answer_cost_micros', 'paid_paise', 'input_tokens', 'cached_tokens'].every((k) => Number.isFinite(t[k])), 'user cost totals numeric');
  ok(detail.usage.length > 0 && detail.usage.every((u) => Number.isFinite(u.cost_micros)), 'every usage row has a cost');
  ok(typeof detail.usd_inr === 'number' && detail.usd_inr > 0, `USD→INR rate in user detail (${detail.usd_inr})`);

  const stats = (await j('/v1/admin/stats', { token: admin })).data;
  const ids = stats.cost?.windows?.map((w) => w.id).join(',');
  ok(ids === '24h,7d,30d,all', `stats cost windows (${ids})`);
  const all = stats.cost.windows.find((w) => w.id === 'all');
  const paidSomething = process.env.CASHFREE_MOCK !== '1' || all.revenue_paise > 0; // payments only run with the mock
  ok(['stt_micros', 'answer_micros', 'revenue_paise'].every((k) => Number.isFinite(all[k])) && paidSomething, `all-time cost & revenue (₹${all.revenue_paise / 100})`);
  ok(stats.daily.every((d) => Number.isFinite(d.cost_micros)), 'daily series has cost');

  const byCost = (await j('/v1/admin/users?sort=cost', { token: admin })).data;
  ok(byCost.users.every((u) => Number.isFinite(u.cost_micros) && Number.isFinite(u.answers)), 'user list has cost and answers');
  ok(byCost.users.every((u, i, a) => i === 0 || a[i - 1].cost_micros >= u.cost_micros), 'sort by cost');
  const bySpend = (await j('/v1/admin/users?sort=paid', { token: admin })).data.users;
  ok(bySpend.every((u, i, a) => i === 0 || a[i - 1].paid_paise >= u.paid_paise), 'sort by amount paid');

  const rate = await j('/v1/admin/config', { token: admin, body: { usd_inr: 90.5 } });
  ok(rate.data.config.usd_inr === 90.5 && (await j('/v1/admin/stats', { token: admin })).data.cost.usd_inr === 90.5, 'USD→INR rate editable');
  await j('/v1/admin/config', { token: admin, body: { usd_inr: 88 } });
}
ok((await j('/v1/auth/logout', { token: web, body: {} })).data.ok && (await j('/v1/me', { token: web })).status === 401, 'logout revokes token');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
cfMock.close();
process.exit(failures ? 1 : 0);
