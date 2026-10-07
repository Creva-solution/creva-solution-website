// POST /api/contact
//   validate -> save to Supabase -> FIRST admin email -> (only if sent) SECOND customer email -> respond
//   The request waits for the emails up to EMAIL_WAIT_MS; if SMTP is slower, the visitor still gets a success
//   (the inquiry is saved) and the emails finish in the background over the pooled SMTP connection.
// GET  /api/contact/:id/status   email delivery state of one submission (no error details)
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { validateContact } from '../validation/contact.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Customer-facing messages only; internal Supabase/SMTP details are logged, never returned.
const MSG = {
    ok: 'Your enquiry has been submitted successfully.',
    error: 'We’re having trouble submitting your enquiry right now. Please try again in a moment.',
    adminFail: 'We received your enquiry but could not complete it right now. Please try again in a moment.'
};

export function contactRouter({ supabase, mailQueue, store, log, emailWaitMs = 15000 }) {
    const router = Router();

    // Waits for the email job (bounded), then answers according to the outcome.
    async function emailAndRespond(res, id, submission, t0, { skipAdmin = false } = {}) {
        const job = mailQueue.enqueue(submission, { skipAdmin });
        const outcome = await Promise.race([job, new Promise((r) => setTimeout(() => r(null), emailWaitMs))]);
        let status, body;
        if (!outcome) {
            // SMTP slower than the wait budget: the inquiry is saved, emails continue in the background.
            status = 202; body = { success: true, ok: true, id, saved: true, emailPending: true, message: MSG.ok };
            log.warn(`[CONTACT] ${id} emails still in progress after ${emailWaitMs}ms; answered and continuing in background`);
        } else if (outcome.admin !== 'sent') {
            // CASE 2: saved, admin email failed -> no customer email, safe error (a retry re-sends the emails only)
            status = 502; body = { success: false, ok: false, id, saved: true, message: MSG.adminFail };
        } else if (outcome.customer === 'failed') {
            // CASE 3: saved, admin informed, customer email failed -> admin email is not repeated
            status = 200; body = { success: true, ok: true, id, saved: true, adminEmail: true, customerEmail: false, message: MSG.ok };
        } else {
            // CASE 4: everything succeeded (or the acknowledgement was rate-limited for this address)
            status = 200; body = { success: true, ok: true, id, saved: true, adminEmail: true, customerEmail: outcome.customer === 'sent', message: MSG.ok };
        }
        store.finish(id, body, submission);
        log.info(`[CONTACT] ${id} request completed in ${Date.now() - t0}ms -> HTTP ${status} (admin=${outcome ? outcome.admin : 'pending'}, customer=${outcome ? outcome.customer : 'pending'})`);
        return res.status(status).json(body);
    }

    router.post('/contact', async (req, res) => {
        const t0 = Date.now();
        log.info('[CONTACT] request received');
        const result = validateContact(req.body);
        if (!result.ok) {
            log.info(`[CONTACT] validation failed (${Object.keys(result.errors).join(', ')})`);
            return res.status(400).json({ success: false, ok: false, message: 'Please check the form and try again.', errors: result.errors });
        }
        const s = result.value;
        const id = s.id || randomUUID();
        log.info(`[CONTACT] ${id} validation completed in ${Date.now() - t0}ms`);

        if (result.spam) {                                   // honeypot filled: pretend success, store/send nothing
            log.info(`[CONTACT] ${id} honeypot triggered, ignored`);
            return res.status(200).json({ success: true, ok: true, id, message: MSG.ok });
        }

        // ---- duplicate protection (double click, browser/network/API retry with the same submission id)
        const seen = store.get(id);
        if (seen && seen.status === 'processing') return res.status(202).json({ success: true, ok: true, id, duplicate: true, processing: true, message: MSG.ok });
        if (seen && seen.status === 'done') {
            const e = seen.email || {};
            if (seen.submission && e.admin === 'failed') {
                log.info(`[CONTACT] ${id} retry after admin email failure: re-sending emails (no new row)`);
                store.start(id, seen.submission);
                return emailAndRespond(res, id, seen.submission, t0);
            }
            if (seen.submission && e.admin === 'sent' && e.customer === 'failed') {
                log.info(`[CONTACT] ${id} retry after customer email failure: re-sending acknowledgement only`);
                store.start(id, seen.submission);
                return emailAndRespond(res, id, seen.submission, t0, { skipAdmin: true });
            }
            log.info(`[CONTACT] ${id} repeated request, returning the stored result`);
            return res.status(seen.response && seen.response.success === false ? 502 : 200).json({ ...seen.response, duplicate: true });
        }
        store.start(id);

        // ---- 1. save (if this fails, no email is sent)
        const tDb = Date.now();
        log.info(`[CONTACT] ${id} Supabase insert started`);
        let saved;
        try {
            saved = await supabase.insertSubmission({ id, ...s });
        } catch (e) {
            store.forget(id);
            log.error(`[CONTACT] ${id} Supabase insert failed after ${Date.now() - tDb}ms (${e.code || 'unknown'}): ${String(e.detail || '').slice(0, 120)}`);
            return res.status(502).json({ success: false, ok: false, id, message: MSG.error });
        }
        log.info(`[CONTACT] ${id} Supabase insert completed in ${Date.now() - tDb}ms${saved.duplicate ? ' (row already existed)' : ''}`);

        if (saved.duplicate) {
            // Row already exists (e.g. saved by an earlier attempt before a restart): never email twice for one inquiry.
            const response = { success: true, ok: true, id, saved: true, duplicate: true, message: MSG.ok };
            store.finish(id, response);
            return res.status(200).json(response);
        }

        // ---- 2. FIRST admin email, then (only if sent) SECOND customer email
        return emailAndRespond(res, id, { ...s, id, submittedAt: new Date() }, t0);
    });

    router.get('/contact/:id/status', (req, res) => {
        const id = String(req.params.id || '').toLowerCase();
        if (!UUID.test(id)) return res.status(400).json({ ok: false, message: 'Invalid id.' });
        const e = store.get(id);
        if (!e || !e.email) return res.status(404).json({ ok: false, message: 'Unknown submission.' });
        res.set('Cache-Control', 'no-store');
        return res.json({ ok: true, id, admin: e.email.admin || 'unknown', customer: e.email.customer || 'unknown' });
    });

    return router;
}
