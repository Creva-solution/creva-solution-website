// In-memory record of recent submissions (by submission id) for duplicate protection and the notification state.
// The database primary key is the durable guard: a repeated id can never create a second row, even after a restart.

const TTL_MS = 24 * 3600e3;

export function createSubmissionStore({ now = () => Date.now() } = {}) {
    const byId = new Map();          // id -> { status: 'processing'|'done', response, notification, at }

    setInterval(() => {
        const cutoff = now() - TTL_MS;
        for (const [k, v] of byId) if (v.at < cutoff) byId.delete(k);
    }, 3600e3).unref();

    const entry = (id) => byId.get(id) || null;
    return {
        get: entry,
        start: (id) => byId.set(id, { ...(entry(id) || {}), status: 'processing', at: now() }),
        finish: (id, response) => byId.set(id, { ...(entry(id) || {}), status: 'done', response, at: now() }),
        forget: (id) => byId.delete(id),
        setNotification(id, state) {
            const e = entry(id) || { status: 'done', at: now() };
            e.notification = state;
            byId.set(id, e);
        }
    };
}
