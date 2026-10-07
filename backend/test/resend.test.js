// Resend provider: real app + real supabase-js against a fake Supabase API and a fake Resend API.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/server.js';

const ORIGIN = 'https://crevasolution.in';
const KEY = 're_test_key_not_real';
let db, resend, api, base, rows = new Map(), sent = [], mode = 'ok', failCount = 0, delayMs = 0, logs = [];

const post = (body) => fetch(`${base}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) });
const valid = (over = {}) => ({ id: crypto.randomUUID(), name: 'Test User', email: 'lead@example.com', mobile: '9876543210', service: 'Web Development', message: 'Test enquiry', ...over });

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
            if (mode === 'unverified') return send(403, { name: 'validation_error', message: 'The crevasolution.in domain is not verified.' });
            if (failCount > 0) { failCount--; return send(500, { name: 'internal_server_error', message: 'temporary' }); }
            const body = JSON.parse(b);
            sent.push({ body, idem: req.headers['idempotency-key'] });
            send(200, { id: crypto.randomUUID() });
        }, delayMs));
    }).listen(0);
    const { app } = createApp({
        port: 0, isProduction: true,
        supabase: { url: `http://127.0.0.1:${db.address().port}`, anonKey: 'anon' },
        provider: 'resend',
        resend: { apiKey: KEY, baseUrl: `http://127.0.0.1:${resend.address().port}`, timeoutMs: 1000 },
        smtp: null,
        mail: { from: 'info@crevasolution.in', fromName: 'Creva Solutions', admin: ['info@crevasolution.in'], siteUrl: 'https://crevasolution.in/' },
        allowedOrigins: [ORIGIN], rateLimitPerWindow: 1000, retryDelaysMs: [50, 100], emailWaitMs: 5000
    }, { log: { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) } });
    api = app.listen(0); await new Promise((r) => api.once('listening', r));
    base = `http://127.0.0.1:${api.address().port}`;
});
after(() => { api.close(); db.close(); resend.close(); });
beforeEach(() => { sent = []; mode = 'ok'; failCount = 0; delayMs = 0; });

test('resend: admin email FIRST then customer email, exact sender/recipients, then 200 success', async () => {
    const body = valid();
    const r = await post(body);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual([j.success, j.saved, j.adminEmail, j.customerEmail], [true, true, true, true]);
    assert.ok(rows.has(body.id));
    assert.equal(sent.length, 2);
    const [admin, customer] = sent;
    assert.equal(admin.body.from, 'Creva Solutions <info@crevasolution.in>');
    assert.deepEqual(admin.body.to, ['info@crevasolution.in']);
    assert.equal(admin.body.reply_to, 'lead@example.com');
    assert.equal(admin.body.subject, 'New Contact Inquiry – Test User');
    assert.ok(admin.body.text.includes('Name:\nTest User') && admin.body.text.includes('Message:\nTest enquiry'));
    assert.equal(customer.body.from, 'Creva Solutions <info@crevasolution.in>');
    assert.deepEqual(customer.body.to, ['lead@example.com']);
    assert.equal(customer.body.reply_to, undefined);
    assert.equal(customer.body.subject, 'Thank You for Contacting Creva Solutions');
    assert.ok(customer.body.text.startsWith('Hi Test User,\n\nThank you for contacting Creva Solutions.'));
    assert.equal(admin.idem, `contact-${body.id}-admin`);
    assert.equal(customer.idem, `contact-${body.id}-customer`);
});

test('resend: domain not verified (403) -> permanent, not retried, 502 safe error, no customer email, row kept', async () => {
    mode = 'unverified';
    const body = valid({ email: 'unverified@example.com' });
    const r = await post(body);
    const j = await r.json();
    assert.equal(r.status, 502);
    assert.deepEqual([j.success, j.saved], [false, true]);
    assert.doesNotMatch(JSON.stringify(j), /verified|Resend|403/);
    assert.ok(rows.has(body.id));
    assert.equal(sent.length, 0);
    assert.equal(logs.filter((l) => l.includes(body.id) && /admin email failed after/.test(l)).length, 1, 'no retry for a permanent error');
});

test('resend: temporary 500 is retried, then both emails go out in order', async () => {
    failCount = 2;
    const body = valid({ email: 'retry@example.com' });
    const r = await post(body);
    assert.equal(r.status, 200);
    assert.deepEqual(sent.map((s) => s.body.to[0]), ['info@crevasolution.in', 'retry@example.com']);
});

test('resend: API timeout is reported as a temporary failure (no hang)', async () => {
    delayMs = 1500;                                   // longer than the 1 s provider timeout, every attempt
    const body = valid({ email: 'slowapi@example.com' });
    const t = Date.now();
    const r = await post(body);
    assert.equal(r.status, 502);
    assert.ok(Date.now() - t < 5500);
    assert.ok(logs.some((l) => l.includes(body.id) && /timeout/i.test(l)));
});

test('resend: API key never appears in logs', () => {
    assert.ok(!logs.join('\n').includes(KEY));
});
