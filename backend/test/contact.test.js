// End-to-end tests: real app, real supabase-js and real Nodemailer against a fake Supabase REST API
// and a local SSL SMTP server (stand-in for smtpout.secureserver.net:465). Run: npm test
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
let smtp, db, api, base, captured = [], rows = new Map(), dbMode = 'ok', rejectRcpt = new Set(), logs = [], greetingDelayMs = 0, failNext = 0;

const config = (over = {}) => ({
    port: 0, isProduction: true,
    supabase: { url: `http://127.0.0.1:${db.address().port}`, anonKey: ANON },
    smtp: { host: '127.0.0.1', port: smtp.server.address().port, secure: true, user: 'info@crevasolution.in', password: PASS, allowSelfSigned: true },
    mail: { from: 'info@crevasolution.in', fromName: 'Creva Solutions', admin: 'info@crevasolution.in', siteUrl: 'https://crevasolution.in/' },
    allowedOrigins: [ORIGIN], rateLimitPerWindow: 1000, retryDelaysMs: [50, 100], ...over
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
const valid = (over = {}) => ({ id: crypto.randomUUID(), name: 'Test User', email: 'test@example.com', mobile: '9876543210', service: 'Web Development', message: 'Test enquiry', ...over });
const waitMail = async (n) => { for (let i = 0; i < 300 && captured.length < n; i++) await new Promise((r) => setTimeout(r, 30)); };
const status = async (id, url = base) => (await fetch(`${url}/api/contact/${id}/status`, { headers: { Origin: ORIGIN } })).json();
const waitStatus = async (id, done) => { let s; for (let i = 0; i < 300; i++) { s = await status(id); if (done(s)) return s; await new Promise((r) => setTimeout(r, 30)); } return s; };
const final = (s) => s.admin && !/queued|sending/.test(s.admin) && !/queued|sending/.test(s.customer);

before(async () => {
    // fake PostgREST for public.contact_submissions (INSERT only, like the anon role)
    db = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj ? JSON.stringify(obj) : ''); };
            if (req.headers.apikey !== ANON) return send(401, { code: '42501', message: 'bad key' });
            if (req.method !== 'POST' || !req.url.startsWith('/rest/v1/contact_submissions')) return send(404, { message: 'nope' });
            if (dbMode === 'down') return send(503, { code: 'PGRST000', message: 'database unavailable' });
            const [row] = JSON.parse(body);
            if (rows.has(row.id)) return send(409, { code: '23505', message: 'duplicate key value violates unique constraint "contact_submissions_pkey"' });
            rows.set(row.id, { ...row, created_at: new Date().toISOString() });
            send(201);
        });
    }).listen(0);
    // local SMTPS server with AUTH, like GoDaddy (implicit TLS on connect)
    const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { days: 1, keySize: 2048 });
    smtp = new SMTPServer({
        onConnect: (_s, cb) => setTimeout(cb, greetingDelayMs),      // simulate a slow SMTP greeting
        secure: true, key: pems.private, cert: pems.cert, authMethods: ['PLAIN', 'LOGIN'], logger: false,
        onAuth: (a, _s, cb) => (a.username === 'info@crevasolution.in' && a.password === PASS ? cb(null, { user: a.username }) : cb(new Error('Invalid login'))),
        onRcptTo: (addr, _s, cb) => {
            if (failNext > 0) { failNext--; return cb(Object.assign(new Error('Try again later'), { responseCode: 451 })); }   // temporary error
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
    assert.equal(r.headers.get('x-powered-by'), null);
});

test('CORS: production origin allowed, others refused (no wildcard)', async () => {
    const pre = await fetch(`${base}/api/contact`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
    for (const o of ['https://evil.example', 'https://www.crevasolution.in', 'http://crevasolution.in']) {
        const p = await fetch(`${base}/api/contact`, { method: 'OPTIONS', headers: { Origin: o, 'Access-Control-Request-Method': 'POST' } });
        assert.equal(p.headers.get('access-control-allow-origin'), null, o);
        const r = await post(valid(), { origin: o });
        assert.equal(r.status, 403, o);
    }
    assert.equal(captured.length, 0);
});

test('invalid submissions -> 400, nothing saved or emailed', async () => {
    const before = rows.size;
    for (const bad of [{ email: 'not-an-email' }, { mobile: '12345' }, { service: '' }, { message: '' }, { name: '' }, { id: 'not-a-uuid' }, { name: 'A'.repeat(101) }]) {
        const r = await post(valid(bad));
        assert.equal(r.status, 400, JSON.stringify(bad));
        const j = await r.json();
        assert.equal(j.ok, false);
    }
    assert.equal((await post('{not json')).status, 400);
    assert.equal(rows.size, before);
    assert.equal(captured.length, 0);
});

test('valid submission: saved and answered immediately, then FIRST admin email, then SECOND customer email (exact headers)', async () => {
    const body = valid();
    const r = await post(body);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual([j.ok, j.saved, j.emailQueued], [true, true, true]);
    assert.deepEqual(await waitStatus(body.id, final), { ok: true, id: body.id, admin: 'sent', customer: 'sent' });
    assert.equal(j.id, body.id);
    const row = rows.get(body.id);
    assert.deepEqual([row.name, row.email, row.mobile, row.service, row.message], ['Test User', 'test@example.com', '+91 9876543210', 'Web Development', 'Test enquiry']);

    await waitMail(2);
    assert.equal(captured.length, 2);
    const [first, second] = captured;
    // order
    assert.ok(first.at <= second.at);
    // FIRST = admin
    assert.equal(first.env.mailFrom.address, 'info@crevasolution.in');
    assert.deepEqual(first.env.rcptTo.map((x) => x.address), ['info@crevasolution.in']);
    assert.equal(first.mail.headers.get('from').text, '"Creva Solutions" <info@crevasolution.in>');
    assert.equal(first.mail.headers.get('to').text, 'info@crevasolution.in');
    assert.equal(first.mail.headers.get('reply-to').text, 'test@example.com');
    assert.equal(first.mail.subject, 'New Contact Inquiry – Test User');
    for (const s of ['New Contact Inquiry', 'Name:\nTest User', 'Email:\ntest@example.com', 'Mobile:\n+91 9876543210', 'Message:\nTest enquiry', 'Submitted:', 'IST', 'Please check the inquiry in the Admin Panel.', 'https://crevasolution.in/'])
        assert.ok(first.mail.text.includes(s), 'admin text has ' + s);
    // SECOND = customer
    assert.equal(second.env.mailFrom.address, 'info@crevasolution.in');
    assert.deepEqual(second.env.rcptTo.map((x) => x.address), ['test@example.com']);
    assert.equal(second.mail.headers.get('from').text, '"Creva Solutions" <info@crevasolution.in>');
    assert.equal(second.mail.headers.get('to').text, 'test@example.com');
    assert.equal(second.mail.headers.get('reply-to'), undefined);
    assert.equal(second.mail.subject, 'Thank You for Contacting Creva Solutions');
    assert.ok(second.mail.text.startsWith('Hi Test User,\n\nThank you for contacting Creva Solutions.'));
    assert.ok(second.mail.text.includes('We have received your enquiry successfully. Our team will review your request and contact you shortly.'));
});

test('retry with the same submission id: no second row, no second emails', async () => {
    const body = valid({ email: 'retry@example.com' });
    assert.equal((await post(body)).status, 200);
    await waitMail(2);
    captured = [];
    const r2 = await post(body);
    const j2 = await r2.json();
    assert.equal(r2.status, 200);
    assert.equal(j2.duplicate, true);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(captured.length, 0);
});

test('double click (two simultaneous requests, same id): one row, one admin + one customer email', async () => {
    const body = valid({ email: 'double@example.com' });
    const before = rows.size;
    const [a, b] = await Promise.all([post(body), post(body)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 202]);
    await waitMail(2); await new Promise((r) => setTimeout(r, 300));
    assert.equal(rows.size, before + 1);
    assert.equal(captured.length, 2);
});

test('id already in the database (e.g. retry after a server restart): no emails', async () => {
    const body = valid({ email: 'restart@example.com' });
    rows.set(body.id, { ...body });                 // saved earlier by a previous process
    const r = await post(body);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.duplicate, true);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(captured.length, 0);
});

test('Supabase insert fails -> 502 generic message, NO email sent', async () => {
    dbMode = 'down';
    const r = await post(valid({ email: 'dbdown@example.com' }));
    const j = await r.json();
    assert.equal(r.status, 502);
    assert.equal(j.ok, false);
    assert.doesNotMatch(JSON.stringify(j), /PGRST|database|supabase|unavailable/i);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(captured.length, 0);
});

test('admin email fails -> record kept, customer email NOT sent', async () => {
    rejectRcpt.add('info@crevasolution.in');
    const body = valid({ email: 'adminfail@example.com' });
    const r = await post(body);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.saved, true);
    assert.ok(rows.has(body.id));
    const st = await waitStatus(body.id, final);
    assert.deepEqual([st.admin, st.customer], ['failed', 'not_sent']);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(captured.length, 0);
});

test('customer email fails -> record kept, admin email sent exactly once', async () => {
    rejectRcpt.add('custfail@example.com');
    const body = valid({ email: 'custfail@example.com' });
    const r = await post(body);
    const j = await r.json();
    assert.deepEqual([r.status, j.saved], [200, true]);
    const st = await waitStatus(body.id, final);
    assert.deepEqual([st.admin, st.customer], ['sent', 'failed']);
    await waitMail(1); await new Promise((r) => setTimeout(r, 300));
    assert.equal(captured.length, 1);
    assert.equal(captured[0].env.rcptTo[0].address, 'info@crevasolution.in');
});

test('honeypot filled -> success response, nothing saved or sent', async () => {
    const body = valid({ email: 'bot@example.com', website: 'http://spam.example' });
    const r = await post(body);
    assert.equal(r.status, 200);
    assert.ok(!rows.has(body.id));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(captured.length, 0);
});

test('hostile name: no header injection, safe greeting, escaped HTML', async () => {
    const r = await post(valid({ name: 'Win cash http://spam.example', email: 'hostile@example.com', message: '<script>alert(1)</script>' }));
    assert.equal(r.status, 200);
    await waitMail(2);
    const [admin, customer] = captured;
    assert.ok(customer.mail.text.startsWith('Hi there,'));
    assert.ok(!admin.mail.html.includes('<script>'));
    assert.ok(admin.mail.html.includes('&lt;script&gt;'));
    assert.equal(captured.flatMap((c) => c.env.rcptTo.map((x) => x.address)).sort().join(','), 'hostile@example.com,info@crevasolution.in');
});

test('acknowledgement limit per address: 4th submission same day -> admin email only', async () => {
    let last;
    for (let i = 0; i < 4; i++) { captured = []; last = valid({ email: 'repeat@example.com' }); await post(last); await waitStatus(last.id, final); }
    assert.equal((await status(last.id)).customer, 'limited');
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(captured.map((c) => c.env.rcptTo[0].address), ['info@crevasolution.in']);
});

test('rate limit per IP -> 429', async () => {
    const { srv, base: b } = await startApi(config({ rateLimitPerWindow: 2 }));
    try {
        const codes = [];
        for (let i = 0; i < 3; i++) codes.push((await post(valid({ email: `rl${i}@example.com` }), { url: b })).status);
        assert.deepEqual(codes, [200, 200, 429]);
        // status lookups and preflights are not counted / not blocked
        for (let i = 0; i < 5; i++) assert.notEqual((await fetch(b + '/api/contact/' + crypto.randomUUID() + '/status')).status, 429);
    } finally { srv.close(); }
});

test('SLOW SMTP (3 s greeting, fresh connection): the visitor gets a response at once; emails still go out in order', async () => {
    // fresh backend instance = no pooled connection yet, so the first email really waits for the slow greeting
    const { srv, base: b } = await startApi(config());
    try {
        greetingDelayMs = 3000;
        const body = valid({ email: 'slowsmtp@example.com' });
        const t = Date.now();
        const r = await post(body, { url: b });
        const ms = Date.now() - t;
        assert.equal(r.status, 200);
        assert.ok(ms < 1500, 'response took ' + ms + 'ms');
        let st; for (let i = 0; i < 400; i++) { st = await status(body.id, b); if (final(st)) break; await new Promise((x) => setTimeout(x, 30)); }
        assert.deepEqual([st.admin, st.customer], ['sent', 'sent']);
        // this submission's own emails (earlier tests' background emails may also be in the capture)
        const mine = captured.filter((c) => c.env.rcptTo[0].address === 'slowsmtp@example.com' || c.mail.headers.get('reply-to')?.text === 'slowsmtp@example.com');
        assert.deepEqual(mine.map((c) => c.env.rcptTo[0].address), ['info@crevasolution.in', 'slowsmtp@example.com']);
        const sent = logs.filter((l) => l.includes(body.id) && /email sent in/.test(l)).map((l) => Number(/sent in (\d+)ms/.exec(l)[1]));
        assert.ok(sent[0] >= 2900, 'admin email waited for the greeting: ' + sent[0] + 'ms');
        assert.ok(sent[1] < 1000, 'customer email reused the pooled connection: ' + sent[1] + 'ms');
    } finally { srv.close(); }
});

test('temporary SMTP error (451) on the admin email is retried; customer email follows only after it', async () => {
    failNext = 2;                                   // first two attempts get 451, third succeeds
    const body = valid({ email: 'retry451@example.com' });
    await post(body);
    const st = await waitStatus(body.id, final);
    assert.deepEqual([st.admin, st.customer], ['sent', 'sent']);
    assert.deepEqual(captured.map((c) => c.env.rcptTo[0].address), ['info@crevasolution.in', 'retry451@example.com']);
    assert.ok(logs.some((l) => /admin email failed .*attempt 1.*retrying/.test(l)));
});

test('SMTP server down: inquiry saved and answered fast, emails marked failed, no customer email, server keeps working', async () => {
    const { srv, base: b } = await startApi(config({ smtp: { host: '127.0.0.1', port: 1, secure: true, user: 'x', password: 'y', allowSelfSigned: true, connectionTimeout: 500 } }));
    try {
        const body = valid({ email: 'smtpdown@example.com' });
        const t = Date.now();
        const r = await post(body, { url: b });
        assert.equal(r.status, 200);
        assert.ok(Date.now() - t < 1500);
        assert.ok(rows.has(body.id));
        let st; for (let i = 0; i < 200; i++) { st = await status(body.id, b); if (!/queued|sending/.test(st.admin)) break; await new Promise((x) => setTimeout(x, 30)); }
        assert.deepEqual([st.admin, st.customer], ['failed', 'not_sent']);
        assert.equal((await fetch(`${b}/health`)).status, 200);
    } finally { srv.close(); }
});

test('status endpoint: only valid ids, no error details', async () => {
    assert.equal((await fetch(`${base}/api/contact/not-a-uuid/status`)).status, 400);
    assert.equal((await fetch(`${base}/api/contact/${crypto.randomUUID()}/status`)).status, 404);
});

test('logs never contain the SMTP password or the Supabase key; addresses are masked', () => {
    const all = logs.join('\n');
    assert.ok(logs.length > 0);
    assert.ok(!all.includes(PASS));
    assert.ok(!all.includes(ANON));
    assert.ok(!all.includes('custfail@example.com'));
});
