// Contact form -> Creva contact API (separate Render backend) -> Supabase public.contact_submissions + emails.
// The backend validates and saves the inquiry, answers immediately, then emails info@crevasolution.in FIRST and
// the customer SECOND in the background. No SMTP or secret keys exist in this file.
//
// Every attempt for one inquiry uses the same submission id, so retries can never create a second row:
// - API slow / still processing  -> ask the API again with the same id (it returns the stored result)
// - API unreachable (network, CORS, Render 502/503/504) -> save directly to Supabase with the public anon key
//   (RLS: visitors can INSERT only), as before, so the inquiry is never lost.
const CONTACT_API_URL = 'https://crevabackend.onrender.com/api/contact';   // Render service (backend/)
const API_TIMEOUT_MS = 30000;          // the API answers in ~1 s; this only covers a waking/slow Render instance
const API_ATTEMPTS = 2;

const SUPABASE_URL = 'https://xtivwelnoccdontbrxft.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0aXZ3ZWxub2NjZG9udGJyeGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDk2NjgsImV4cCI6MjA4NTc4NTY2OH0.zImQM_l1437a62HpO-lAqkWbp0KxOqz9Hg9OmqHgoXU';

const CONTACT_TABLE = 'contact_submissions';
const MSG_SUCCESS = 'Thank you! Your message has been sent successfully. We’ll get back to you soon.';
const MSG_ERROR = 'We’re having trouble submitting your enquiry right now. Please try again in a moment.';

// Normalise an Indian mobile number to "+91 XXXXXXXXXX" (returns '' if it is not a valid 10-digit mobile).
function normaliseMobile(raw) {
    const digits = String(raw || '').replace(/[^\d]/g, '');
    const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
            : digits;
    return /^[6-9]\d{9}$/.test(ten) ? '+91 ' + ten : '';
}

function newSubmissionId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// One request. Returns 'ok' | 'pending' (slow / still processing: ask again) | 'unreachable' | { error }
async function postOnce(payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    try {
        const res = await fetch(CONTACT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ctrl.signal
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 202) return 'pending';                   // same id is being processed right now
        if (res.ok && data.ok) return 'ok';                          // saved (emails are sent by the API)
        if (res.status === 400) {
            const first = data.errors && Object.values(data.errors)[0];
            return { error: first || 'Please check the form and try again.' };
        }
        if (res.status === 429) return { error: data.message || 'Too many submissions. Please try again later.' };
        return 'unreachable';                                        // 403 / 5xx / Render 502-504: save directly instead
    } catch (err) {
        return err && err.name === 'AbortError' ? 'pending' : 'unreachable';   // timeout vs. network/CORS failure
    } finally {
        clearTimeout(timer);
    }
}

// Retries the SAME submission id; the API de-duplicates it, so a slow first attempt is never sent twice.
async function sendToApi(payload) {
    let last = 'unreachable';
    for (let i = 0; i < API_ATTEMPTS; i++) {
        last = await postOnce(payload);
        if (last === 'ok' || typeof last === 'object') return last;
        if (i < API_ATTEMPTS - 1) await wait(last === 'pending' ? 1500 : 2000 * (i + 1));
    }
    // Still unconfirmed: the direct save below uses the same id, so if the API already saved it nothing is duplicated.
    return 'unreachable';
}

// Previous behaviour: insert straight into Supabase (no emails). Duplicate id = already saved by the API.
async function saveDirectly(payload) {
    let client = window.supabaseClient;
    if (!client && typeof supabase !== 'undefined') client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!client) throw new Error('no client');
    const { id, name, email, mobile, service, message } = payload;
    // No .select() on purpose: visitors have INSERT permission only, so nothing is read back.
    const { error } = await client.from(CONTACT_TABLE).insert([{ id, name, email, mobile, service, message }]);
    if (error && error.code !== '23505') throw error;
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form[name="contact"]');
    if (!form) return;
    const status = document.getElementById('form-status');
    const btn = form.querySelector('button[type="submit"]');

    // Hidden honeypot field (people never see or fill it; many bots do). Rejected silently by the API.
    const trap = document.createElement('input');
    Object.assign(trap, { type: 'text', name: 'website', tabIndex: -1, autocomplete: 'off' });
    trap.setAttribute('aria-hidden', 'true');
    trap.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
    form.appendChild(trap);

    // Wake the API early (Render instances can take a moment to respond after being idle).
    fetch(CONTACT_API_URL.replace(/\/api\/contact$/, '/health'), { method: 'GET', mode: 'cors' }).catch(() => {});

    // One id per inquiry: kept for retries of the same message, renewed after a successful send.
    let submissionId = newSubmissionId();
    let sending = false;
    let quietUntil = 0;                // ignore a stray second click right after a successful send

    const show = (type, text) => {
        if (!status) return;
        status.hidden = false;
        status.className = 'ct-status ' + (type === 'ok' ? 'ct-status-ok' : 'ct-status-err');
        status.textContent = text;
    };
    const fail = (text, field) => {
        show('err', text);
        if (field) field.focus();
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (sending || Date.now() < quietUntil) return;              // double click / double submit
        if (status) status.hidden = true;

        const f = n => form.querySelector('[name="' + n + '"]');
        const name = f('name').value.trim();
        const email = f('email').value.trim();
        const mobile = normaliseMobile(f('mobile').value);
        const service = f('service').value.trim();
        const message = f('message').value.trim();

        // Validation (all fields are required by the table); the API checks the same rules again.
        if (!name) return fail('Please enter your full name.', f('name'));
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.', f('email'));
        if (!mobile) return fail('Please enter a valid 10-digit mobile number.', f('mobile'));
        if (!service) return fail('Please select the service you are interested in.', f('service'));
        if (!message) return fail('Please enter your message.', f('message'));

        const payload = { id: submissionId, name, email, mobile, service, message, website: trap.value };
        const originalHtml = btn.innerHTML;
        sending = true;
        let slowTimer;
        try {
            btn.disabled = true;
            btn.textContent = 'Sending...';
            slowTimer = setTimeout(() => { btn.textContent = 'Still sending...'; }, 8000);

            let result = await sendToApi(payload);
            if (result === 'unreachable') {
                if (trap.value) result = 'ok';                       // bot: do not store
                else { await saveDirectly(payload); result = 'ok'; }
            }
            if (result === 'ok') {
                show('ok', MSG_SUCCESS);
                form.reset();
                submissionId = newSubmissionId();
                quietUntil = Date.now() + 3000;
            } else {
                show('err', result.error);
            }
        } catch (err) {
            // Details stay out of the UI; only a short code is logged for debugging.
            console.warn('Contact form submission failed', err && err.code ? err.code : '');
            show('err', MSG_ERROR);
        } finally {
            clearTimeout(slowTimer);
            sending = false;
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (window.lucide) window.lucide.createIcons();
        }
    });
});
