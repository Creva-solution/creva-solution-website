// Admin notification email for a new contact inquiry. Exactly ONE email per inquiry, sent to
// ADMIN_NOTIFICATION_EMAIL. The customer never receives any email (their address is only stored in Supabase).
// Sender = MAIL_FROM / MAIL_FROM_NAME from the environment (nothing is hard-coded).
import nodemailer from 'nodemailer';

export const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const oneLine = (v, max = 80) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function formatIST(date) {
    return new Date(date).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    }) + ' IST';
}

export function buildAdminNotification(s, mail) {
    const name = oneLine(s.name, 100) || 'Website visitor';
    const rows = [
        ['Customer Name', name],
        ['Customer Email', s.email],
        ['Mobile', s.mobile],
        ...(s.service ? [['Service', oneLine(s.service, 100)]] : []),
        ['Message', String(s.message ?? '').slice(0, 5000)],
        ['Submitted Date/Time', formatIST(s.submittedAt)]
    ];
    const adminUrl = `${mail.siteUrl.replace(/\/$/, '')}/admin/contacts.html`;
    const text = `New Contact Inquiry

A new enquiry has been submitted through the Creva Solutions website.

${rows.map(([k, v]) => `${k}:\n${v}`).join('\n\n')}

Please check the Admin Panel for this inquiry.
${adminUrl}

Creva Solutions
IT & Civil Solutions
${mail.siteUrl}
`;
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px;line-height:1.6;font-size:15px;">
<h2 style="margin:0 0 8px;font-size:20px;color:#0b1a3c;">New Contact Inquiry</h2>
<p>A new enquiry has been submitted through the Creva Solutions website.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.map(([k, v]) => `
<tr><td style="padding:8px 12px 8px 0;vertical-align:top;color:#6b7280;white-space:nowrap;"><strong>${escapeHtml(k)}</strong></td>
<td style="padding:8px 0;white-space:pre-wrap;word-break:break-word;">${escapeHtml(v)}</td></tr>`).join('')}
</table>
<p style="margin-top:16px;">Please check the <a href="${escapeHtml(adminUrl)}" style="color:#3C77C3;">Admin Panel</a> for this inquiry.</p>
<p style="margin-top:24px;color:#374151;">Creva Solutions<br>IT &amp; Civil Solutions<br><a href="${escapeHtml(mail.siteUrl)}" style="color:#3C77C3;">${escapeHtml(mail.siteUrl)}</a></p>
</div></body></html>`;
    return {
        from: { name: mail.fromName, address: mail.from },
        to: [].concat(mail.adminNotification),
        replyTo: s.email,                      // pressing "Reply" writes to the customer (manually); nothing is auto-sent to them
        subject: `New Contact Inquiry – ${name}`,
        text, html
    };
}

const timed = async (fn) => {
    const t = Date.now();
    try { const r = await fn(); return { ...r, ms: Date.now() - t }; }
    catch (e) { e.ms = Date.now() - t; throw e; }
};

// Delivery method: SMTP (Nodemailer; needs a host whose outbound SMTP ports are open – Render Free blocks
// 25/465/587) or the Resend HTTPS API (works on Render Free).
export function createEmailService(cfg, mail, log = console) {
    return cfg.provider === 'resend' ? createResendService(cfg.resend, mail, log) : createSmtpService(cfg.smtp, mail, log);
}

// ---- SMTP: one pooled transporter for the whole process (connect + TLS + AUTH happens once and is reused).
export function createSmtpService(smtp, mail, log = console) {
    const transport = nodemailer.createTransport({
        pool: true,
        maxConnections: 1,
        maxMessages: 100,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.password },
        connectionTimeout: smtp.connectionTimeout ?? 30000,
        greetingTimeout: smtp.greetingTimeout ?? 30000,
        socketTimeout: smtp.socketTimeout ?? 60000,
        ...(smtp.allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {})
    });
    // A pooled transport reports background connection problems as events; never let them crash the process.
    transport.on('error', (e) => log.error(`[EMAIL] SMTP transport error: ${e.code || ''} ${e.message}`));
    return {
        sendAdminNotification: (s) => timed(() => transport.sendMail(buildAdminNotification(s, mail))),
        verify: () => timed(() => transport.verify().then(() => ({}))),
        close: () => transport.close()
    };
}

// ---- Resend (https://resend.com) – HTTPS port 443.
export function createResendService({ apiKey, baseUrl = 'https://api.resend.com', timeoutMs = 15000 }, mail, log = console) {
    async function send(message, idempotencyKey) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        let res;
        try {
            res = await fetch(`${baseUrl}/emails`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
                body: JSON.stringify({
                    from: message.from.name ? `${message.from.name} <${message.from.address}>` : message.from.address,
                    to: message.to,
                    reply_to: message.replyTo,
                    subject: message.subject,
                    html: message.html,
                    text: message.text
                }),
                signal: ctrl.signal
            });
        } catch (e) {
            const err = new Error(e.name === 'AbortError' ? `Resend request timeout after ${timeoutMs}ms` : `Resend request failed: ${e.message}`);
            err.code = e.name === 'AbortError' ? 'ETIMEDOUT' : 'ECONNECTION';
            err.transient = true;
            throw err;
        } finally { clearTimeout(timer); }
        const body = await res.json().catch(() => ({}));
        if (res.ok) return { messageId: body.id };
        const err = new Error(`Resend HTTP ${res.status}: ${String(body.message || body.name || 'error').slice(0, 150)}`);
        err.code = `HTTP_${res.status}`;
        err.transient = res.status === 429 || res.status >= 500;      // 4xx (bad key, unverified sender) are permanent
        throw err;
    }
    return {
        // Idempotency-Key: a retry of the same inquiry's notification is never delivered twice.
        sendAdminNotification: (s) => timed(() => send(buildAdminNotification(s, mail), `contact-${s.id}-admin`)),
        verify: () => timed(async () => ({})),
        close: () => {}
    };
}
