// Manual browser end-to-end check of contact.html + this backend (not part of `npm test`; needs Chrome).
// Usage: node test/browser-e2e.mjs "C:/Program Files/Google/Chrome/Application/chrome.exe"
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import selfsigned from 'selfsigned';
import { createApp } from '../src/server.js';

const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
const SITE = path.resolve(import.meta.dirname, '../..');
const CHROME = process.argv[2];

const rows = new Map(); const mails = []; let dbDown = false;
const db = http.createServer((req, res) => {
    let b = ''; req.on('data', c => (b += c)); req.on('end', () => {
        const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(o ? JSON.stringify(o) : ''); };
        if (dbDown) return send(503, { code: 'PGRST000', message: 'down' });
        const [row] = JSON.parse(b);
        if (rows.has(row.id)) return send(409, { code: '23505', message: 'duplicate' });
        rows.set(row.id, row); send(201);
    });
}).listen(0);
const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { days: 1, keySize: 2048 });
const smtp = new SMTPServer({ secure: true, key: pems.private, cert: pems.cert, authMethods: ['PLAIN', 'LOGIN'], logger: false,
    onAuth: (a, _s, cb) => cb(null, { user: a.username }),
    onData(stream, session, cb) { const ch = []; stream.on('data', c => ch.push(c)); stream.on('end', async () => { const m = await simpleParser(Buffer.concat(ch)); mails.push({ to: session.envelope.rcptTo.map(r => r.address).join(','), from: m.headers.get('from').text, subject: m.subject }); cb(); }); } });
await new Promise(r => smtp.listen(0, '127.0.0.1', r));

// website server (port fixed so the allowed origin is known)
const SITE_PORT = 8790;
const SITE_ORIGIN = `http://localhost:${SITE_PORT}`;
const { app } = createApp({
    port: 0, isProduction: true,
    supabase: { url: `http://127.0.0.1:${db.address().port}`, anonKey: 'anon' },
    smtp: { host: '127.0.0.1', port: smtp.server.address().port, secure: true, user: 'info@crevasolution.in', password: 'x', allowSelfSigned: true },
    mail: { from: 'info@crevasolution.in', fromName: 'Creva Solutions', admin: 'info@crevasolution.in', siteUrl: 'https://crevasolution.in/' },
    allowedOrigins: [SITE_ORIGIN], rateLimitPerWindow: 1000
}, { log: { info() {}, warn() {}, error() {} } });
const apiSrv = app.listen(0); await new Promise(r => apiSrv.once('listening', r));
let apiUrl = `http://127.0.0.1:${apiSrv.address().port}/api/contact`;

const T = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const site = http.createServer((q, r) => {
    let f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    let body = fs.readFileSync(f);
    if (f.endsWith('contact-submission.js')) body = body.toString().replace(/const CONTACT_API_URL = '[^']+'/, `const CONTACT_API_URL = '${apiUrl}'`);
    r.writeHead(200, { 'Content-Type': T[path.extname(f)] || '' }); r.end(body);
}).listen(SITE_PORT);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function page(vp) {
    const p = await browser.newPage(); await p.setViewport(vp);
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    // direct-to-Supabase fallback goes to the real project URL: answer it locally, like the RLS insert
    const fallback = [];
    await p.setRequestInterception(true);
    p.on('request', req => {
        const u = req.url();
        if (u.includes('xtivwelnoccdontbrxft.supabase.co/rest/v1/contact_submissions')) {
            if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
            const [row] = JSON.parse(req.postData()); fallback.push(row);
            const dup = rows.has(row.id); if (!dup) rows.set(row.id, row);
            return req.respond({ status: dup ? 409 : 201, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: dup ? JSON.stringify({ code: '23505' }) : '' });
        }
        if (/cdn\.jsdelivr|unpkg|fonts\.g/.test(u)) return req.continue();
        req.continue();
    });
    await p.goto(`${SITE_ORIGIN}/contact.html`, { waitUntil: 'networkidle2' });
    return { p, errors, fallback };
}
async function fill(p, { name = 'Test User', email = 'test@example.com', mobile = '9876543210', message = 'Test enquiry' } = {}) {
    await p.$eval('form[name=contact]', f => f.reset());
    await p.type('[name=name]', name); await p.type('[name=email]', email); await p.type('[name=mobile]', mobile);
    await p.evaluate(() => { const s = document.querySelector('[name=service]'); s.selectedIndex = 1; s.dispatchEvent(new Event('change')); });
    await p.type('[name=message]', message);
}
const statusText = (p) => p.$eval('#form-status', e => (e.hidden ? '(hidden)' : e.className.replace('ct-status ', '') + ': ' + e.textContent));

for (const vp of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const { p, errors, fallback } = await page(vp);
    rows.clear(); mails.length = 0;
    await fill(p);
    await p.click('button[type=submit]'); await p.click('button[type=submit]').catch(() => {});   // double click
    await p.waitForFunction(() => !document.getElementById('form-status').hidden, { timeout: 30000 }); await sleep(500);
    const st = await statusText(p);
    const formCleared = await p.$eval('[name=name]', e => e.value === '');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(`[${vp.name}] success flow -> ${st}\n   rows saved: ${rows.size} (${[...rows.values()].map(r => r.mobile + ' / ' + r.service).join(', ')}) | form cleared: ${formCleared} | overflowX: ${overflow}`);
    console.log(`   emails in order: ${mails.map(m => `${m.subject} [from ${m.from} -> ${m.to}]`).join('  THEN  ')}`);
    console.log(`   fallback used: ${fallback.length} | page errors: ${errors.length ? errors.join(' | ') : 'none'}`);

    // invalid (server-side 400 path is covered by unit tests; here: browser validation message)
    await fill(p, { mobile: '123' }); await p.click('button[type=submit]'); await sleep(300);
    console.log(`   invalid mobile -> ${await statusText(p)}`);
    if (vp.name === 'desktop') await p.screenshot({ path: path.join(process.env.SHOTS || '.', 'contact-form-desktop.png') });
    else await p.screenshot({ path: path.join(process.env.SHOTS || '.', 'contact-form-mobile.png') });
    await p.close();
}

// backend unreachable -> direct Supabase fallback with the same id, no duplicate
{
    apiUrl = 'http://127.0.0.1:9/api/contact';            // nothing listening
    const { p, errors, fallback } = await page({ width: 1280, height: 900 });
    rows.clear(); mails.length = 0;
    await fill(p, { email: 'fallback@example.com' });
    await p.click('button[type=submit]');
    await p.waitForFunction(() => !document.getElementById('form-status').hidden, { timeout: 30000 });
    console.log(`[backend down] -> ${await statusText(p)} | fallback inserts: ${fallback.length} | rows: ${rows.size} | emails: ${mails.length} | errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
}
await browser.close(); [db, smtp, apiSrv, site].forEach(s => s.close());
