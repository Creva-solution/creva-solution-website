// Validation for POST /api/contact (same rules as the website form, enforced again on the server).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const LIMITS = { name: 100, email: 254, service: 100, message: 5000 };

const clean = (v) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim() : '');

// Indian mobile -> "+91 XXXXXXXXXX" (same as js/contact-submission.js); '' if not a valid 10-digit mobile.
export function normaliseMobile(raw) {
    const digits = String(raw || '').replace(/[^\d]/g, '');
    const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
            : digits;
    return /^[6-9]\d{9}$/.test(ten) ? '+91 ' + ten : '';
}

export function isValidEmail(v) {
    return typeof v === 'string' && v.length <= LIMITS.email && !/[\r\n]/.test(v) && EMAIL.test(v);
}

/**
 * @returns {{ ok: true, value: object, spam: boolean } | { ok: false, errors: Record<string,string> }}
 */
export function validateContact(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { body: 'Invalid request.' } };
    const errors = {};
    const name = clean(body.name).replace(/\s+/g, ' ');
    const email = clean(body.email).toLowerCase();
    const mobile = normaliseMobile(body.mobile);
    const service = clean(body.service).replace(/\s+/g, ' ');
    const message = clean(body.message);
    const id = clean(body.id);

    if (!name) errors.name = 'Please enter your full name.';
    else if (name.length > LIMITS.name || /[\r\n]/.test(name)) errors.name = 'Please enter a shorter name.';
    if (!isValidEmail(email)) errors.email = 'Please enter a valid email address.';
    if (!mobile) errors.mobile = 'Please enter a valid 10-digit mobile number.';
    if (!service) errors.service = 'Please select the service you are interested in.';
    else if (service.length > LIMITS.service) errors.service = 'Please select a service from the list.';
    if (!message) errors.message = 'Please enter your message.';
    else if (message.length > LIMITS.message) errors.message = `Please keep your message under ${LIMITS.message} characters.`;
    if (id && !UUID.test(id)) errors.id = 'Invalid submission id.';

    if (Object.keys(errors).length) return { ok: false, errors };
    // "website" is a hidden honeypot field: people never fill it, bots usually do.
    const spam = clean(body.website).length > 0;
    return { ok: true, spam, value: { id: id ? id.toLowerCase() : null, name, email, mobile, service, message } };
}
