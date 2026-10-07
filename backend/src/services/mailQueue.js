// Background email delivery for saved inquiries.
// Per inquiry, strictly in this order: admin notification (retried) -> only if sent -> customer acknowledgement
// (retried). Inquiries are processed one at a time over the pooled SMTP connection. The HTTP request does not
// wait for this, so a slow SMTP server never delays or breaks the contact form.

const TRANSIENT = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|ESOCKET|ECONNECTION|EDNS|EAI_AGAIN|ENOTFOUND|timeout|Greeting never received|Connection closed|socket hang up/i;

export function isTransient(e) {
    if (!e) return false;
    if (e.responseCode && e.responseCode >= 400 && e.responseCode < 500) return true;   // 4xx = try again later
    return TRANSIENT.test(`${e.code || ''} ${e.message || ''}`);
}

const errText = (e) => `${e && e.responseCode ? e.responseCode + ' ' : ''}${e && e.code ? e.code + ' ' : ''}${(e && e.message) || e}`.slice(0, 200);
const mask = (email) => String(email).replace(/^(.).*?(@.*)$/, '$1***$2');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{ email: object, store: object, log: object, retryDelaysMs?: number[], allowAck?: (email:string)=>boolean }} deps
 */
export function createMailQueue({ email, store, log, retryDelaysMs = [5000, 20000, 60000] }) {
    const queue = [];
    let running = false;

    async function attempt(kind, id, fn) {
        for (let i = 0; i <= retryDelaysMs.length; i++) {
            try {
                const r = await fn();
                log.info(`[CONTACT] ${id} ${kind} email sent in ${r.ms}ms${i ? ` (attempt ${i + 1})` : ''}`);
                return true;
            } catch (e) {
                const retry = i < retryDelaysMs.length && isTransient(e);
                log.error(`[CONTACT] ${id} ${kind} email failed after ${e.ms ?? '?'}ms (attempt ${i + 1}): ${errText(e)}${retry ? ` - retrying in ${retryDelaysMs[i] / 1000}s` : ''}`);
                if (!retry) return false;
                await sleep(retryDelaysMs[i]);
            }
        }
        return false;
    }

    async function processJob(job) {
        const { submission: s, skipAdmin } = job;
        const started = Date.now();
        let adminOk = true;
        if (skipAdmin) {
            log.info(`[CONTACT] ${s.id} admin email already sent earlier, not repeated`);
        } else {
            store.setEmail(s.id, { admin: 'sending' });
            log.info(`[CONTACT] ${s.id} admin email started`);
            adminOk = await attempt('admin', s.id, () => email.sendAdmin(s));
            store.setEmail(s.id, { admin: adminOk ? 'sent' : 'failed' });
        }
        if (!adminOk) {
            store.setEmail(s.id, { customer: 'not_sent' });          // never acknowledge before the admin is informed
            log.error(`[CONTACT] ${s.id} customer email not sent because the admin email failed`);
        } else if (!store.allowAck(s.email)) {
            store.setEmail(s.id, { customer: 'limited' });
            log.warn(`[CONTACT] ${s.id} acknowledgement limit reached for ${mask(s.email)}, not sent`);
        } else {
            store.setEmail(s.id, { customer: 'sending' });
            log.info(`[CONTACT] ${s.id} customer email started`);
            const custOk = await attempt('customer', s.id, () => email.sendCustomer(s));
            store.setEmail(s.id, { customer: custOk ? 'sent' : 'failed' });
            if (!custOk) log.error(`[CONTACT] ${s.id} customer email to ${mask(s.email)} failed`);
        }
        log.info(`[CONTACT] ${s.id} email job finished in ${Date.now() - started}ms`);
        const e = (store.get(s.id) || {}).email || {};
        return { admin: e.admin, customer: e.customer };
    }

    async function run() {
        if (running) return;
        running = true;
        try {
            while (queue.length) {
                const job = queue.shift();
                try { job.resolve(await processJob(job)); }
                catch (e) { log.error(`[CONTACT] ${job.submission.id} email job crashed: ${errText(e)}`); job.resolve({ admin: 'failed', customer: 'not_sent' }); }
            }
        } finally { running = false; }
    }

    return {
        // Returns a promise for the final { admin, customer } states. skipAdmin: the admin email was already sent.
        enqueue(submission, { skipAdmin = false } = {}) {
            store.setEmail(submission.id, skipAdmin ? { customer: 'queued' } : { admin: 'queued', customer: 'queued' });
            return new Promise((resolve) => { queue.push({ submission, skipAdmin, resolve }); run(); });
        },
        size: () => queue.length + (running ? 1 : 0),
        idle: async () => { while (running || queue.length) await sleep(20); }
    };
}
