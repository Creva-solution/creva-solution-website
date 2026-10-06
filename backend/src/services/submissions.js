// In-memory record of recent submissions (by submission id) for duplicate protection, plus a per-recipient
// limit for acknowledgement emails. The database primary key is the durable guard: a repeated id can never
// create a second row, even after a restart.

const TTL_MS = 24 * 3600e3;

export function createSubmissionStore({ maxAcksPerRecipientPerDay = 3, now = () => Date.now() } = {}) {
    const byId = new Map();          // id -> { status: 'processing'|'done', response, at }
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

    return {
        get: (id) => byId.get(id) || null,
        start: (id) => byId.set(id, { status: 'processing', at: now() }),
        finish: (id, response) => byId.set(id, { status: 'done', response, at: now() }),
        forget: (id) => byId.delete(id),
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
