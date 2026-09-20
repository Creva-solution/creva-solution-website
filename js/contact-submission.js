// Contact form -> Supabase table public.contact_submissions
// Only the public anon key is used here (safe to expose; access is limited by Row Level Security:
// visitors can INSERT only, they cannot read, update or delete submissions). Never put a service_role key in this file.
const SUPABASE_URL = 'https://xtivwelnoccdontbrxft.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0aXZ3ZWxub2NjZG9udGJyeGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDk2NjgsImV4cCI6MjA4NTc4NTY2OH0.zImQM_l1437a62HpO-lAqkWbp0KxOqz9Hg9OmqHgoXU';

const CONTACT_TABLE = 'contact_submissions';
const MSG_SUCCESS = 'Thank you! Your message has been sent successfully. We’ll get back to you soon.';
const MSG_ERROR = 'Something went wrong. Please try again or contact us directly.';

// Normalise an Indian mobile number to "+91 XXXXXXXXXX" (returns '' if it is not a valid 10-digit mobile).
function normaliseMobile(raw) {
    const digits = String(raw || '').replace(/[^\d]/g, '');
    const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
            : digits;
    return /^[6-9]\d{9}$/.test(ten) ? '+91 ' + ten : '';
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form[name="contact"]');
    if (!form) return;
    const status = document.getElementById('form-status');
    const btn = form.querySelector('button[type="submit"]');

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
        if (status) status.hidden = true;

        const f = n => form.querySelector('[name="' + n + '"]');
        const name = f('name').value.trim();
        const email = f('email').value.trim();
        const mobile = normaliseMobile(f('mobile').value);
        const service = f('service').value.trim();
        const message = f('message').value.trim();

        // Validation (all fields are required by the table)
        if (!name) return fail('Please enter your full name.', f('name'));
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.', f('email'));
        if (!mobile) return fail('Please enter a valid 10-digit mobile number.', f('mobile'));
        if (!service) return fail('Please select the service you are interested in.', f('service'));
        if (!message) return fail('Please enter your message.', f('message'));

        // Reuse the site's Supabase client when present, otherwise create one with the anon key.
        let client = window.supabaseClient;
        if (!client && typeof supabase !== 'undefined') client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        if (!client) return show('err', MSG_ERROR);

        const originalHtml = btn.innerHTML;
        try {
            btn.disabled = true;
            btn.textContent = 'Sending...';

            // No .select() on purpose: visitors have INSERT permission only, so nothing is read back.
            const { error } = await client.from(CONTACT_TABLE).insert([{ name, email, mobile, service, message }]);
            if (error) throw error;

            show('ok', MSG_SUCCESS);
            form.reset();
        } catch (err) {
            // Details stay out of the UI; only a short code is logged for debugging.
            console.warn('Contact form submission failed', err && err.code ? err.code : '');
            show('err', MSG_ERROR);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (window.lucide) window.lucide.createIcons();
        }
    });
});
