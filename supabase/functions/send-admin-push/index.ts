// Supabase Edge Function: send-admin-push
// Trigger: Database Webhook on public.contact_submissions INSERT (Supabase Dashboard -> Database -> Webhooks).
// Sends an FCM HTTP v1 push to every registered device of every user in public.admin_users.
//
// Secrets (Supabase Dashboard -> Edge Functions -> Secrets, or `supabase secrets set`):
//   WEBHOOK_SECRET        random string; the webhook must send it in the "x-webhook-secret" header
//   FCM_SERVICE_ACCOUNT   the Firebase service-account JSON (one line). Never commit it.
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Deploy: supabase functions deploy send-admin-push --no-verify-jwt   (the webhook authenticates with WEBHOOK_SECRET)

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const MAX_AGE_MS = 15 * 60 * 1000;          // ignore replays of old rows
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
type Submission = { id: string; created_at: string; name?: string | null };

const env = (k: string) => Deno.env.get(k) ?? '';
const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tail = (t: string) => '…' + t.slice(-6);    // never log full device tokens

function timingSafeEqual(a: string, b: string): boolean {
    const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
    let diff = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
    return diff === 0;
}

// ---------- Supabase REST with the service role (server-side only)
function dbHeaders(): Record<string, string> {
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;   // legacy JWT keys
    return h;
}
async function db(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(env('SUPABASE_URL') + '/rest/v1/' + path, { ...init, headers: { ...dbHeaders(), ...(init.headers ?? {}) } });
}

// ---------- Google OAuth access token for FCM (JWT bearer grant, RS256 via WebCrypto), cached ~55 min
let cachedToken: { value: string; exp: number } | null = null;

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function googleAccessToken(sa: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.exp - 300 > now) return cachedToken.value;
    const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: FCM_SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }));
    const pem = sa.private_key.replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
    const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claims));
    const res = await fetch(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: header + '.' + claims + '.' + b64url(sig) })
    });
    if (!res.ok) throw new Error('Google OAuth failed: HTTP ' + res.status);
    const data = await res.json();
    cachedToken = { value: data.access_token, exp: now + (data.expires_in ?? 3600) };
    return cachedToken.value;
}

// ---------- FCM HTTP v1
function buildMessage(token: string, s: Submission) {
    const name = (s.name ?? '').toString().trim().replace(/\s+/g, ' ').slice(0, 60) || 'a website visitor';
    return {
        message: {
            token,
            notification: { title: '🔔 New Contact Inquiry', body: `New inquiry received from ${name}. Tap to view.` },
            // Only what the app needs to open the right inquiry; details are loaded from Supabase after login.
            data: { type: 'contact_submission', submission_id: s.id },
            android: {
                priority: 'HIGH',
                ttl: '86400s',
                notification: { channel_id: 'inquiries', tag: s.id, notification_priority: 'PRIORITY_HIGH', visibility: 'PRIVATE', default_sound: true }
            },
            apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } }
        }
    };
}

// FCM error codes meaning the token will never work again -> remove it.
function isDeadToken(status: number, body: any): boolean {
    const details: any[] = body?.error?.details ?? [];
    const codes = details.map((d) => d?.errorCode).filter(Boolean);
    if (codes.includes('UNREGISTERED') || codes.includes('SENDER_ID_MISMATCH')) return true;
    if (status === 404) return true;
    if (status === 400 && codes.includes('INVALID_ARGUMENT') && /registration token|token/i.test(body?.error?.message ?? '')) return true;
    return false;
}

async function sendToAll(tokens: string[], s: Submission, sa: ServiceAccount) {
    const access = await googleAccessToken(sa);
    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const post = (token: string) => fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildMessage(token, s))
    });
    const results = await Promise.allSettled(tokens.map(async (token) => {
        let res = await post(token);
        if (res.status === 429 || res.status >= 500) {          // temporary FCM problem: retry once
            await new Promise((r) => setTimeout(r, 1000));
            res = await post(token);
        }
        if (res.ok) return { token, ok: true };
        const body = await res.json().catch(() => ({}));
        return { token, ok: false, status: res.status, dead: isDeadToken(res.status, body), code: body?.error?.status };
    }));
    const sent: string[] = [], dead: string[] = [], failed: Record<string, unknown>[] = [];
    for (const r of results) {
        if (r.status === 'rejected') { failed.push({ error: String(r.reason) }); continue; }
        if (r.value.ok) sent.push(r.value.token);
        else if (r.value.dead) dead.push(r.value.token);
        else failed.push({ token: tail(r.value.token), status: r.value.status, code: r.value.code });
    }
    return { sent: sent.length, dead, failed };
}

async function removeTokens(tokens: string[]) {
    for (const t of tokens) {
        await db('admin_push_tokens?fcm_token=eq.' + encodeURIComponent(t), { method: 'DELETE' }).catch(() => {});
    }
}

// ---------- handler
export async function handler(req: Request): Promise<Response> {
    if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

    const secret = env('WEBHOOK_SECRET');
    if (!secret || !timingSafeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) return json(401, { error: 'unauthorized' });

    let payload: any;
    try { payload = await req.json(); } catch { return json(400, { error: 'invalid JSON' }); }
    if (payload?.type !== 'INSERT' || payload?.table !== 'contact_submissions' || payload?.schema !== 'public') {
        return json(200, { skipped: 'not a contact_submissions INSERT' });
    }
    const id = payload?.record?.id;
    if (typeof id !== 'string' || !UUID.test(id)) return json(400, { error: 'missing record id' });

    // Never trust the webhook body: confirm the row really exists and is recent.
    const rowRes = await db(`contact_submissions?id=eq.${id}&select=id,created_at,name`);
    if (!rowRes.ok) { console.error('lookup failed', rowRes.status); return json(502, { error: 'lookup failed' }); }
    const [row] = (await rowRes.json()) as Submission[];
    if (!row) return json(404, { error: 'submission not found' });
    if (Date.now() - new Date(row.created_at).getTime() > MAX_AGE_MS) return json(200, { skipped: 'submission too old' });

    let sa: ServiceAccount;
    try { sa = JSON.parse(env('FCM_SERVICE_ACCOUNT')); if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error(); }
    catch { console.error('FCM_SERVICE_ACCOUNT secret is missing or invalid'); return json(500, { error: 'push not configured' }); }

    const tokRes = await db('rpc/get_admin_push_tokens', { method: 'POST', body: '{}' });
    if (!tokRes.ok) { console.error('token lookup failed', tokRes.status); return json(502, { error: 'token lookup failed' }); }
    const tokens = [...new Set(((await tokRes.json()) as { fcm_token: string }[]).map((r) => r.fcm_token).filter(Boolean))];
    if (!tokens.length) { console.log('no admin devices registered'); return json(200, { sent: 0, devices: 0 }); }

    try {
        const { sent, dead, failed } = await sendToAll(tokens, row, sa);
        if (dead.length) await removeTokens(dead);
        console.log(JSON.stringify({ submission: row.id, devices: tokens.length, sent, removed: dead.length, failed: failed.length }));
        if (failed.length) console.warn('push failures', JSON.stringify(failed));
        return json(200, { sent, devices: tokens.length, removed: dead.length, failed: failed.length });
    } catch (err) {
        console.error('push send error:', err instanceof Error ? err.message : String(err));
        return json(502, { error: 'push send failed' });
    }
}

Deno.serve(handler);
