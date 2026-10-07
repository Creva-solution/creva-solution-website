// End-to-end tests (SMTP provider): real app, real supabase-js and real Nodemailer against a fake Supabase REST API
// and a local SSL SMTP server. Rule under test: ONE admin notification per inquiry, ZERO emails to the customer.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import selfsigned from 'selfsigned';
import { createApp } from '../src/server.js';

const ORIGIN = 'https://crevasolution.in';
const ANON = 'test-anon-key-not-real';
const PASS = 'smtp-test-password-123';
const SENDER = 'notifications@example.test';          // whatever MAIL_FROM / SMTP_USER is configured as
const ADMIN_TO = 'crevasolution@gmail.com';
let smtp, db, api, base, captured = [], rows = new Map(), dbMode = 'ok', rejectRcpt = new Set(), logs = [], greetingDelayMs = 0, failNext = 0;

const config = (over = {}) => ({
    port: 0, isProduction: true, provider: 'smtp',
    supabase: { url: `http://127.0.0.1:${db.address().port}`, anonKey: ANON },
    smtp: { host: '127.0.0.1', port: smtp.server.address().port, secure: true, user: SENDER, password: PASS, allowSelfSigned: true },
    mail: { from: SENDER, fromName: 'Creva Solutions', adminNotification: [ADMIN_TO], siteUrl: 'https://crevasolution.in/' },
    allowedOrigins: [ORIGIN], rateLimitPerWindow: 1000, retryDelaysMs: [50, 100], emailWaitMs: 15000, ...over
});
const capture = { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) };

async function startApi(cfg) {
    const { app } = createApp(cfg, { log: capture });
    const srv = app.listen(0);
    await new Promise((r) => srv.once('listening', r));
    return { srv, base: `http://127.0.0.1:${srv.address().port}` };
}
const post = (body, { origin = ORIGIN, url = base } = {}) => fetch(`${url}/api/contact`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body)
});
const valid = (over = {}) => ({ id: crypto.randomUUID(), name: 'Test User', email: 'customer@example.com', mobile: '9876543210', service: 'Web Development', message: 'Test enquiry', ...over });
const status = async (id, url = base) => (await fetch(`${url}/api/contact/${id}/status`, { headers: { Origin: ORIGIN } })).json();
const rcpts = () => captured.flatMap((c) => c.env.rcptTo.map((x) => x.address));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
    db = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj ? JSON.stringify(obj) : ''); };
            if (req.headers.apikey !== ANON) return send(401, { code: '42501', message: 'bad key' });
            if (dbMode === 'down') return send(503, { code: 'PGRST000', message: 'database unavailable' });
            const [row] = JSON.parse(body);
            if (rows.has(row.id)) return send(409, { code: '23505', message: 'duplicate key value violates unique constraint "contact_submissions_pkey"' });
            rows.set(row.id, { ...row, created_at: new Date().toISOString() });
            send(201);
        });
    }).listen(0);
    const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { days: 1, keySize: 2048 });
    smtp = new SMTPServer({
        onConnect: (_s, cb) => setTimeout(cb, greetingDelayMs),
        secure: true, key: pems.private, cert: pems.cert, authMethods: ['PLAIN', 'LOGIN'], logger: false,
        onAuth: (a, _s, cb) => (a.username === SENDER && a.password === PASS ? cb(null, { user: a.username }) : cb(new Error('Invalid login'))),
        onRcptTo: (addr, _s, cb) => {
            if (failNext > 0) { failNext--; return cb(Object.assign(new Error('Try again later'), { responseCode: 451 })); }
            return rejectRcpt.has(addr.address) ? cb(Object.assign(new Error('Mailbox unavailable'), { responseCode: 550 })) : cb();
        },
        onData(stream, session, cb) {
            const chunks = []; stream.on('data', (c) => chunks.push(c));
            stream.on('end', async () => { const raw = Buffer.concat(chunks).toString(); captured.push({ at: Date.now(), env: session.envelope, raw, mail: await simpleParser(raw) }); cb(); });
        }
    });
    await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
    ({ srv: api, base } = await startApi(config()));
});
after(() => { api.close(); db.close(); smtp.close(); });
beforeEach(() => { captured = []; dbMode = 'ok'; rejectRcpt = new Set(); greetingDelayMs = 0; failNext = 0; });

test('GET /health returns only {"status":"ok"}', async () => {
    const r = await fetch(`${base}/health`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { status: 'ok' });
});

test('CORS: production origin allowed, others refused (no wildcard)', async () => {
    const pre = await fetch(`${base}/api/contact`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
    for (const o of ['https://evil.example', 'https://www.crevasolution.in', 'http://crevasolution.in']) {
        assert.equal((await post(valid(), { origin: o })).status, 403, o);
    }
    assert.equal(captured.length, 0);
});

test('invalid submissions -> 400, nothing saved, no email', async () => {
    const before = rows.size;
    for (const bad of [{ email: 'not-an-email' }, { mobile: '12345' }, { service: '' }, { message: '' }, { name: '' }, { id: 'not-a-uuid' }]) {
        const r = await post(valid(bad));
        assert.equal(r.status, 400, JSON.stringify(bad));
        assert.equal((await r.json()).success, false);
    }
    assert.equal((await post('{not json')).status, 400);
    assert.equal(rows.size, before);
    assert.equal(captured.length, 0);
});

test('valid submission: saved to Supabase (customer email stored), exactly ONE notification to crevasolution@gmail.com, ZERO to the customer', async () => {
    const body = valid();
    const r = await post(body);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual([j.success, j.saved, j.notified], [true, true, true]);
    assert.equal(j.message, 'Your enquiry has been submitted successfully.');
    const row = rows.get(body.id);
    assert.deepEqual([row.name, row.email, row.mobile, row.service, row.message], ['Test User', 'customer@example.com', '+91 9876543210', 'Web Development', 'Test enquiry']);

    await sleep(300);
    assert.equal(captured.length, 1, 'exactly one email');
    assert.deepEqual(rcpts(), [ADMIN_TO], 'only crevasolution@gmail.com, never the customer');
    const m = captured[0];
    assert.equal(m.env.mailFrom.address, SENDER);
    assert.equal(m.mail.headers.get('from').text, `"Creva Solutions" <${SENDER}>`);
    assert.equal(m.mail.headers.get('to').text, ADMIN_TO);
    assert.equal(m.mail.headers.get('cc'), undefined);
    assert.equal(m.mail.headers.get('bcc'), undefined);
    assert.equal(m.mail.subject, 'New Contact Inquiry – Test User');
    for (const s of ['Customer Name:\nTest User', 'Customer Email:\ncustomer@example.com', 'Mobile:\n+91 9876543210', 'Message:\nTest enquiry', 'Submitted Date/Time:', 'IST', 'Please check the Admin Panel for this inquiry.'])
        assert.ok(m.mail.text.includes(s), 'notification has ' + s);
    assert.doesNotMatch(m.raw, /info@crevasolution\.in/);
    assert.deepEqual(await status(body.id), { ok: true, id: body.id, notification: 'sent' });
});

test('three different inquiries -> three rows, three notifications, no customer emails', async () => {
    const before = rows.size;
    for (const n of [1, 2, 3]) assert.equal((await post(valid({ name: `Person ${n}`, email: `p${n}@example.com` }))).status, 200);
    await sleep(300);
    assert.equal(rows.size, before + 3);
    assert.deepEqual(rcpts(), [ADMIN_TO, ADMIN_TO, ADMIN_TO]);
    assert.deepEqual(captured.map((c) => c.mail.subject), ['New Contact Inquiry – Person 1', 'New Contact Inquiry – Person 2', 'New Contact Inquiry – Person 3']);
});

test('retry with the same submission id: no second row, no second notification', async () => {
    const body = valid({ email: 'retry@example.com' });
    assert.equal((await post(body)).status, 200);
    await sleep(200); captured = [];
    const before = rows.size;
    const r2 = await post(body);
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).duplicate, true);
    await sleep(300);
    assert.equal(rows.size, before);
    assert.equal(captured.length, 0);
});

test('double click (two simultaneous requests, same id): one row, ONE notification', async () => {
    const body = valid({ email: 'double@example.com' });
    const before = rows.size;
    const [a, b] = await Promise.all([post(body), post(body)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 202]);
    await sleep(300);
    assert.equal(rows.size, before + 1);
    assert.equal(captured.length, 1);
});

test('id already in the database (retry after a server restart): no notification', async () => {
    const body = valid({ email: 'restart@example.com' });
    rows.set(body.id, { ...body });
    const r = await post(body);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).duplicate, true);
    await sleep(300);
    assert.equal(captured.length, 0);
});

test('Supabase insert fails -> 502 generic message, NO email', async () => {
    dbMode = 'down';
    const r = await post(valid({ email: 'dbdown@example.com' }));
    const j = await r.json();
    assert.equal(r.status, 502);
    assert.equal(j.success, false);
    assert.doesNotMatch(JSON.stringify(j), /PGRST|database|supabase|unavailable/i);
    await sleep(300);
    assert.equal(captured.length, 0);
});

test('notification fails permanently -> record kept, no duplicate row, success shown to customer, failure logged', async () => {
    rejectRcpt.add(ADMIN_TO);
    const body = valid({ email: 'notifyfail@example.com' });
    const before = rows.size;
    const r = await post(body);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual([j.success, j.saved, j.notified], [true, true, false]);
    assert.doesNotMatch(JSON.stringify(j), /550|SMTP|Mailbox|smtp/);
    assert.equal(rows.size, before + 1);
    assert.equal(captured.length, 0);
    assert.ok(logs.some((l) => l.includes(body.id) && /admin notification email failed/.test(l)));
    assert.equal((await status(body.id)).notification, 'failed');
});

test('temporary SMTP error (451) is retried; still exactly one notification delivered', async () => {
    failNext = 2;
    const body = valid({ email: 'retry451@example.com' });
    const r = await post(body);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).notified, true);
    await sleep(200);
    assert.deepEqual(rcpts(), [ADMIN_TO]);
});

test('slow SMTP beyond the wait budget: 202 success at once, notification still delivered once', async () => {
    const { srv, base: b } = await startApi(config({ emailWaitMs: 1000 }));
    try {
        greetingDelayMs = 3000;
        const body = valid({ email: 'slow@example.com' });
        const t = Date.now();
        const r = await post(body, { url: b });
        assert.equal(r.status, 202);
        const j = await r.json();
        assert.deepEqual([j.success, j.saved, j.notificationPending], [true, true, true]);
        assert.ok(Date.now() - t < 1800);
        let st; for (let i = 0; i < 300; i++) { st = await status(body.id, b); if (st.notification === 'sent') break; await sleep(30); }
        assert.equal(st.notification, 'sent');
        assert.deepEqual(rcpts(), [ADMIN_TO]);
    } finally { srv.close(); }
});

test('SMTP server unreachable: inquiry saved, success shown, server keeps working', async () => {
    const { srv, base: b } = await startApi(config({ smtp: { host: '127.0.0.1', port: 1, secure: true, user: 'x', password: 'y', allowSelfSigned: true, connectionTimeout: 500 } }));
    try {
        const body = valid({ email: 'smtpdown@example.com' });
        const r = await post(body, { url: b });
        assert.equal(r.status, 200);
        const j = await r.json();
        assert.deepEqual([j.saved, j.notified], [true, false]);
        assert.ok(rows.has(body.id));
        assert.equal((await fetch(`${b}/health`)).status, 200);
    } finally { srv.close(); }
});

test('honeypot filled -> success response, nothing saved or sent', async () => {
    const body = valid({ email: 'bot@example.com', website: 'http://spam.example' });
    assert.equal((await post(body)).status, 200);
    assert.ok(!rows.has(body.id));
    await sleep(300);
    assert.equal(captured.length, 0);
});

test('hostile input: no header injection, HTML escaped, still only the admin recipient', async () => {
    // line breaks in the name are collapsed to spaces by validation, so they can never start a new header
    const r = await post(valid({ name: 'Evil\r\nBcc: victim@x.com', email: 'hostile@example.com', message: '<script>alert(1)</script>' }));
    assert.equal(r.status, 200);
    await sleep(300);
    assert.deepEqual(rcpts(), [ADMIN_TO], 'no injected Bcc recipient');
    assert.doesNotMatch(captured[0].raw, /^bcc:/im);
    assert.equal(captured[0].mail.subject, 'New Contact Inquiry – Evil Bcc: victim@x.com');
    assert.ok(!captured[0].mail.html.includes('<script>'));
    assert.ok(captured[0].mail.html.includes('&lt;script&gt;'));
});

test('rate limit per IP -> 429 (status lookups not counted)', async () => {
    const { srv, base: b } = await startApi(config({ rateLimitPerWindow: 2 }));
    try {
        const codes = [];
        for (let i = 0; i < 3; i++) codes.push((await post(valid({ email: `rl${i}@example.com` }), { url: b })).status);
        assert.deepEqual(codes, [200, 200, 429]);
        for (let i = 0; i < 5; i++) assert.notEqual((await fetch(`${b}/api/contact/${crypto.randomUUID()}/status`)).status, 429);
    } finally { srv.close(); }
});

test('status endpoint: only valid ids, no error details', async () => {
    assert.equal((await fetch(`${base}/api/contact/not-a-uuid/status`)).status, 400);
    assert.equal((await fetch(`${base}/api/contact/${crypto.randomUUID()}/status`)).status, 404);
});

test('logs never contain the SMTP password or the Supabase key', () => {
    const all = logs.join('\n');
    assert.ok(logs.length > 0);
    assert.ok(!all.includes(PASS));
    assert.ok(!all.includes(ANON));
});
