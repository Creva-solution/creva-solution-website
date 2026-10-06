// POST /api/contact
// Order: validate -> save to Supabase -> FIRST admin email -> only then SECOND customer email -> respond.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { validateContact } from '../validation/contact.js';

const mask = (email) => String(email).replace(/^(.).*?(@.*)$/, '$1***$2');
const errText = (e) => (e && (e.responseCode ? `${e.responseCode} ` : '') + (e.code ? `${e.code} ` : '') + (e.message || String(e))).slice(0, 200);

// Customer-facing messages only; internal Supabase/SMTP details are logged, never returned.
const MSG = {
    ok: 'Thank you! Your message has been sent successfully. We’ll get back to you soon.',
    error: 'Something went wrong. Please try again or contact us directly.'
};

export function contactRouter({ supabase, email, store, log }) {
    const router = Router();

    router.post('/contact', async (req, res) => {
        const result = validateContact(req.body);
        if (!result.ok) return res.status(400).json({ ok: false, message: 'Please check the form and try again.', errors: result.errors });

        const s = result.value;
        const id = s.id || randomUUID();
        if (result.spam) {                                   // honeypot filled: pretend success, store/send nothing
            log.info(`contact ${id}: honeypot triggered, ignored`);
            return res.status(200).json({ ok: true, id, message: MSG.ok });
        }

        // ---- duplicate protection (double click, browser/network/API retry with the same submission id)
        const seen = store.get(id);
        if (seen && seen.status === 'processing') return res.status(202).json({ ok: true, id, duplicate: true, message: MSG.ok });
        if (seen && seen.status === 'done') return res.status(200).json({ ...seen.response, duplicate: true });
        store.start(id);

        // ---- 1. save (if this fails, no email is sent)
        let saved;
        try {
            saved = await supabase.insertSubmission({ id, ...s });
        } catch (e) {
            store.forget(id);
            log.error(`contact ${id}: Supabase insert failed (${e.code || 'unknown'})`);
            return res.status(502).json({ ok: false, id, message: MSG.error });
        }
        if (saved.duplicate) {
            // Row already exists (e.g. retry after a server restart): never email twice for one inquiry.
            const response = { ok: true, id, saved: true, duplicate: true, message: MSG.ok };
            store.finish(id, response);
            log.info(`contact ${id}: already saved, no emails re-sent`);
            return res.status(200).json(response);
        }

        const submission = { ...s, id, submittedAt: new Date() };
        const response = { ok: true, id, saved: true, adminNotified: false, customerNotified: false, message: MSG.ok };

        // ---- 2. FIRST: admin notification to info@crevasolution.in
        try {
            await email.sendAdmin(submission);
            response.adminNotified = true;
        } catch (e) {
            log.error(`contact ${id}: admin email failed - ${errText(e)}`);
        }

        // ---- 3. SECOND: customer acknowledgement, only after the admin email was sent
        if (response.adminNotified) {
            if (!store.allowAck(s.email)) {
                log.warn(`contact ${id}: acknowledgement limit reached for ${mask(s.email)}, not sent`);
            } else {
                try {
                    await email.sendCustomer(submission);
                    response.customerNotified = true;
                } catch (e) {
                    log.error(`contact ${id}: customer email to ${mask(s.email)} failed - ${errText(e)}`);
                }
            }
        }

        store.finish(id, response);
        log.info(`contact ${id}: saved=true admin=${response.adminNotified} customer=${response.customerNotified}`);
        // The inquiry is saved in every case below, so the visitor sees the normal success message.
        return res.status(200).json(response);
    });

    return router;
}
