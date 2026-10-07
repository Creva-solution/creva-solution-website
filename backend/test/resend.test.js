// Resend provider: real app + real supabase-js against a fake Supabase API and a fake Resend API.
// Rule under test: ONE admin notification per inquiry, ZERO emails to the customer.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/server.js';

const ORIGIN = 'https://crevasolution.in';
const KEY = 're_test_key_not_real';
const ADMIN_TO = 'crevasolution@gmail.com';
let db, resend, api, base, rows = new Map(), sent = [], mode = 'ok', failCount = 0, delayMs = 0, logs = [];

const post = (body) => fetch(`${base}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) });
const valid = (over = {}) => ({ id: crypto.randomUUID(), name: 'Test User', email: 'customer@example.com', mobile: '9876543210', service: 'Web Development', message: 'Test enquiry', ...over });

before(async () => {
    db = http.createServer((req, res) => {
        let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
            const [row] = JSON.parse(b);
            if (rows.has(row.id)) { res.writeHead(409, { 'Content-Type': 'application/json' }); return res.end('{"code":"23505","message":"duplicate"}'); }
            rows.set(row.id, row); res.writeHead(201); res.end();
        });
    }).listen(0);
    resend = http.createServer((req, res) => {
        let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => setTimeout(() => {
            const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
            if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { name: 'missing_api_key', message: 'Missing API key' });
            if (mode === 'unverified') return send(403, { name: 'validation_error', message: 'The sender domain is not verified.' });
            if (failCount > 0) { failCount--; return send(500, { name: 'internal_server_error', message: 'temporary' }); }
            sent.push({ body: JSON.parse(b), idem: req.headers['idempotency-key'] });
            send(200, { id: crypto.randomUUID() });
        }, delayMs));
    }).listen(0);
    const { app } = createApp({
        port: 0, isProduction: true,
        supabase: { url: `http://127.0.0.1:${db.address().port}`, anonKey: 'anon' },
        provider: 'resend',
        resend: { apiKey: KEY, baseUrl: `http://127.0.0.1:${resend.address().port}`, timeoutMs: 1000 },
        smtp: null,
        mail: { from: 'onboarding@resend.dev', fromName: 'Creva Solutions', adminNotification: [ADMIN_TO], siteUrl: 'https://crevasolution.in/' },
        allowedOrigins: [ORIGIN], rateLimitPerWindow: 1000, retryDelaysMs: [50, 100], emailWaitMs: 5000
    }, { log: { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) } });
    api = app.listen(0); await new Promise((r) => api.once('listening', r));
    base = `http://127.0.0.1:${api.address().port}`;
});
after(() => { api.close(); db.close(); resend.close(); });
beforeEach(() => { sent = []; mode = 'ok'; failCount = 0; delayMs = 0; });

test('resend: exactly ONE notification to crevasolution@gmail.com, nothing to the customer, then 200 success', async () => {
    const body = valid();
    const r = await post(body);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual([j.success, j.saved, j.notified], [true, true, true]);
    assert.ok(rows.has(body.id));
    assert.equal(rows.get(body.id).email, 'customer@example.com');
    assert.equal(sent.length, 1);
    const m = sent[0];
    assert.equal(m.body.from, 'Creva Solutions <onboarding@resend.dev>');
    assert.deepEqual(m.body.to, [ADMIN_TO]);
    assert.equal(m.body.cc, undefined);
    assert.equal(m.body.bcc, undefined);
    assert.equal(m.body.reply_to, 'customer@example.com');
    assert.equal(m.body.subject, 'New Contact Inquiry – Test User');
    assert.ok(m.body.text.includes('Customer Email:\ncustomer@example.com') && m.body.text.includes('Please check the Admin Panel for this inquiry.'));
    assert.equal(m.idem, `contact-${body.id}-admin`);
    assert.doesNotMatch(JSON.stringify(m.body), /info@crevasolution\.in/);
});

test('resend: sender not verified (403) -> not retried, inquiry saved, success shown, failure logged', async () => {
    mode = 'unverified';
    const body = valid({ email: 'unverified@example.com' });
    const r = await post(body);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual([j.success, j.saved, j.notified], [true, true, false]);
    assert.doesNotMatch(JSON.stringify(j), /verified|Resend|403/);
    assert.ok(rows.has(body.id));
    assert.equal(sent.length, 0);
    assert.equal(logs.filter((l) => l.includes(body.id) && /notification email failed after/.test(l)).length, 1, 'no retry for a permanent error');
});

test('resend: temporary 500 is retried; exactly one notification delivered', async () => {
    failCount = 2;
    const r = await post(valid({ email: 'retry@example.com' }));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).notified, true);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body.to, [ADMIN_TO]);
});

test('resend: API timeout does not hang the form', async () => {
    delayMs = 1500;
    const body = valid({ email: 'slowapi@example.com' });
    const t = Date.now();
    const r = await post(body);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).notified, false);
    assert.ok(Date.now() - t < 5500);
    assert.ok(logs.some((l) => l.includes(body.id) && /timeout/i.test(l)));
});

test('resend: API key never appears in logs', () => {
    assert.ok(!logs.join('\n').includes(KEY));
});
