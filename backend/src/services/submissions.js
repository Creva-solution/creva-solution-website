// In-memory record of recent submissions (by submission id): duplicate protection, email delivery status and a
// per-recipient limit for acknowledgement emails. The database primary key is the durable guard: a repeated id
// can never create a second row, even after a restart.

const TTL_MS = 24 * 3600e3;

export function createSubmissionStore({ maxAcksPerRecipientPerDay = 3, now = () => Date.now() } = {}) {
    const byId = new Map();          // id -> { status: 'processing'|'done', response, email: {admin, customer}, at }
    const acks = new Map();          // email -> [timestamps]

    function prune() {
        const cutoff = now() - TTL_MS;
        for (const [k, v] of byId) if (v.at < cutoff) byId.delete(k);
        for (const [k, list] of acks) {
            const keep = list.filter((t) => t >= cutoff);
            if (keep.length) acks.set(k, keep); else acks.delete(k);
        }
    }
    setInterval(prune, 3600e3).unref();

    const entry = (id) => byId.get(id) || null;
    return {
        get: entry,
        // submission data is kept (24 h, memory only) so a retry can re-send failed emails without a new row
        start: (id, submission) => byId.set(id, { ...(entry(id) || {}), status: 'processing', at: now(), ...(submission ? { submission } : {}) }),
        finish: (id, response, submission) => byId.set(id, { ...(entry(id) || {}), status: 'done', response, at: now(), ...(submission ? { submission } : {}) }),
        forget: (id) => byId.delete(id),
        setEmail(id, patch) {
            const e = entry(id) || { status: 'done', at: now() };
            e.email = { ...(e.email || {}), ...patch };
            byId.set(id, e);
        },
        // true if another acknowledgement to this address is allowed (and records it)
        allowAck(email) {
            const cutoff = now() - TTL_MS;
            const list = (acks.get(email) || []).filter((t) => t >= cutoff);
            if (list.length >= maxAcksPerRecipientPerDay) { acks.set(email, list); return false; }
            list.push(now()); acks.set(email, list);
            return true;
        }
    };
}
