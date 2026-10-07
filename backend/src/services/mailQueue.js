// Sends the single admin notification for each saved inquiry (one at a time, retried on temporary errors).
// No email is ever sent to the customer.

const TRANSIENT = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|ESOCKET|ECONNECTION|EDNS|EAI_AGAIN|ENOTFOUND|timeout|Greeting never received|Connection closed|socket hang up|fetch failed/i;

export function isTransient(e) {
    if (!e) return false;
    if (typeof e.transient === 'boolean') return e.transient;                               // set by the API provider
    if (e.responseCode && e.responseCode >= 400 && e.responseCode < 500) return true;   // SMTP 4xx = try again later
    return TRANSIENT.test(`${e.code || ''} ${e.message || ''}`);
}

const errText = (e) => `${e && e.responseCode ? e.responseCode + ' ' : ''}${e && e.code ? e.code + ' ' : ''}${(e && e.message) || e}`.slice(0, 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createMailQueue({ email, store, log, retryDelaysMs = [5000, 20000, 60000] }) {
    const queue = [];
    let running = false;

    async function sendWithRetry(s) {
        for (let i = 0; i <= retryDelaysMs.length; i++) {
            try {
                const r = await email.sendAdminNotification(s);
                log.info(`[CONTACT] ${s.id} admin notification email sent in ${r.ms}ms${i ? ` (attempt ${i + 1})` : ''}`);
                return 'sent';
            } catch (e) {
                const retry = i < retryDelaysMs.length && isTransient(e);
                log.error(`[CONTACT] ${s.id} admin notification email failed after ${e.ms ?? '?'}ms (attempt ${i + 1}): ${errText(e)}${retry ? ` - retrying in ${retryDelaysMs[i] / 1000}s` : ''}`);
                if (!retry) return 'failed';
                await sleep(retryDelaysMs[i]);
            }
        }
        return 'failed';
    }

    async function run() {
        if (running) return;
        running = true;
        try {
            while (queue.length) {
                const job = queue.shift();
                const s = job.submission;
                let state = 'failed';
                try {
                    store.setNotification(s.id, 'sending');
                    log.info(`[CONTACT] ${s.id} admin notification email started`);
                    state = await sendWithRetry(s);
                } catch (e) {
                    log.error(`[CONTACT] ${s.id} notification job crashed: ${errText(e)}`);
                }
                store.setNotification(s.id, state);
                job.resolve(state);
            }
        } finally { running = false; }
    }

    return {
        // Returns a promise for the final notification state: 'sent' | 'failed'.
        enqueue(submission) {
            store.setNotification(submission.id, 'queued');
            return new Promise((resolve) => { queue.push({ submission, resolve }); run(); });
        },
        idle: async () => { while (running || queue.length) await sleep(20); }
    };
}
