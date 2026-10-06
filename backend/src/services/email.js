// Email over GoDaddy SMTP (info@crevasolution.in) with Nodemailer.
//   Admin notification:      From "Creva Solutions" <info@crevasolution.in>  To info@crevasolution.in  (Reply-To: lead)
//   Customer acknowledgement: From "Creva Solutions" <info@crevasolution.in>  To <lead's email>          (no Reply-To)
import nodemailer from 'nodemailer';

export const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const oneLine = (v, max = 80) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// The acknowledgement goes to an address typed into a public form, so it carries no visitor text except a
// plausible personal name (links, symbols or long text fall back to "there").
export function greetingName(name) {
    const n = oneLine(name, 60);
    if (!n || n.length > 40) return 'there';
    if (/https?:|www\.|@|\.(com|in|net|org|xyz|ru)\b/i.test(n)) return 'there';
    if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(n)) return 'there';
    return n;
}

export function formatIST(date) {
    return new Date(date).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    }) + ' IST';
}

const signatureText = (site) => `Creva Solutions\nIT & Civil Solutions\n\n${site}`;
const wrapHtml = (inner, site) => `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px;line-height:1.6;font-size:15px;">${inner}
<p style="margin-top:24px;color:#374151;">Creva Solutions<br>IT &amp; Civil Solutions<br><a href="${escapeHtml(site)}" style="color:#3C77C3;">${escapeHtml(site)}</a></p>
</div></body></html>`;

export function buildAdminEmail(s, mail) {
    const name = oneLine(s.name, 100) || 'Website visitor';
    const rows = [
        ['Name', name], ['Email', s.email], ['Mobile', s.mobile],
        ...(s.service ? [['Service', oneLine(s.service, 100)]] : []),
        ['Message', String(s.message ?? '').slice(0, 5000)], ['Submitted', formatIST(s.submittedAt)]
    ];
    const text = `New Contact Inquiry

A new enquiry has been submitted through the Creva Solutions website.

${rows.map(([k, v]) => `${k}:\n${v}`).join('\n\n')}

Please check the inquiry in the Admin Panel.

${signatureText(mail.siteUrl)}
`;
    const html = wrapHtml(`<h2 style="margin:0 0 8px;font-size:20px;color:#0b1a3c;">New Contact Inquiry</h2>
<p>A new enquiry has been submitted through the Creva Solutions website.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.map(([k, v]) => `
<tr><td style="padding:8px 12px 8px 0;vertical-align:top;color:#6b7280;white-space:nowrap;"><strong>${escapeHtml(k)}</strong></td>
<td style="padding:8px 0;white-space:pre-wrap;word-break:break-word;">${escapeHtml(v)}</td></tr>`).join('')}
</table>
<p style="margin-top:16px;">Please check the inquiry in the <a href="${escapeHtml(mail.siteUrl.replace(/\/$/, ''))}/admin/contacts.html" style="color:#3C77C3;">Admin Panel</a>.</p>`, mail.siteUrl);
    return {
        from: { name: mail.fromName, address: mail.from },
        to: [].concat(mail.admin),             // ADMIN_EMAIL may list several addresses
        replyTo: s.email,                      // "Reply" in the inbox answers the customer
        subject: `New Contact Inquiry – ${name}`,
        text, html
    };
}

export function buildCustomerEmail(s, mail) {
    const name = greetingName(s.name);
    const text = `Hi ${name},

Thank you for contacting Creva Solutions.

We have received your enquiry successfully. Our team will review your request and contact you shortly.

Regards,
${signatureText(mail.siteUrl)}
`;
    const html = wrapHtml(`<p>Hi ${escapeHtml(name)},</p>
<p>Thank you for contacting Creva Solutions.</p>
<p>We have received your enquiry successfully. Our team will review your request and contact you shortly.</p>
<p style="margin-bottom:0;">Regards,</p>`, mail.siteUrl);
    return {
        from: { name: mail.fromName, address: mail.from },
        to: s.email,
        subject: 'Thank You for Contacting Creva Solutions',
        text, html
    };
}

// One pooled SMTP transporter for the whole process: the slow part of talking to GoDaddy from Render is
// connecting + TLS + greeting + AUTH, so an authenticated connection is kept open and reused for the admin
// and customer emails (and later inquiries) instead of reconnecting for every message.
export function createEmailService(smtp, mail, log = console) {
    const transport = nodemailer.createTransport({
        pool: true,
        maxConnections: 1,                         // GoDaddy: one connection is plenty and avoids parallel logins
        maxMessages: 100,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,                       // GoDaddy: 465 + implicit SSL
        auth: { user: smtp.user, pass: smtp.password },
        connectionTimeout: smtp.connectionTimeout ?? 30000,
        greetingTimeout: smtp.greetingTimeout ?? 30000,
        socketTimeout: smtp.socketTimeout ?? 60000,
        ...(smtp.allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {})
    });
    // A pooled transport reports background connection problems as events; never let them crash the process.
    transport.on('error', (e) => log.error(`[SMTP] transport error: ${e.code || ''} ${e.message}`));

    const timed = async (label, fn) => {
        const t = Date.now();
        try { const r = await fn(); return { ...r, ms: Date.now() - t }; }
        catch (e) { e.ms = Date.now() - t; throw e; }
    };
    return {
        sendAdmin: (s) => timed('admin', () => transport.sendMail(buildAdminEmail(s, mail))),
        sendCustomer: (s) => timed('customer', () => transport.sendMail(buildCustomerEmail(s, mail))),
        // Opens (and authenticates) a connection; used at startup so the first inquiry does not pay for it.
        verify: () => timed('verify', () => transport.verify().then(() => ({}))),
        close: () => transport.close()
    };
}
