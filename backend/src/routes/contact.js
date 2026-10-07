// POST /api/contact
//   validate -> save to Supabase public.contact_submissions -> ONE admin notification email -> respond
//   The customer never receives an email. The request waits for the notification up to EMAIL_WAIT_MS; if the mail
//   provider is slower, the visitor still gets a success (the inquiry is saved) and the email finishes in background.
// GET  /api/contact/:id/status   notification state of one submission (no error details)
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { validateContact } from '../validation/contact.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Customer-facing messages only; internal Supabase/email details are logged, never returned.
const MSG = {
    ok: 'Your enquiry has been submitted successfully.',
    error: 'We’re having trouble submitting your enquiry right now. Please try again in a moment.'
};

export function contactRouter({ supabase, mailQueue, store, log, emailWaitMs = 15000 }) {
    const router = Router();

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
        log.info(`[CONTACT] ${id} validation passed (${Date.now() - t0}ms)`);

        if (result.spam) {                                   // honeypot filled: pretend success, store/send nothing
            log.info(`[CONTACT] ${id} honeypot triggered, ignored`);
            return res.status(200).json({ success: true, ok: true, id, message: MSG.ok });
        }

        // ---- duplicate protection (double click, browser/network/API retry with the same submission id)
        const seen = store.get(id);
        if (seen && seen.status === 'processing') return res.status(202).json({ success: true, ok: true, id, duplicate: true, processing: true, message: MSG.ok });
        if (seen && seen.status === 'done') {
            log.info(`[CONTACT] ${id} repeated request, returning the stored result (nothing saved or sent again)`);
            return res.status(200).json({ ...seen.response, duplicate: true });
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
        log.info(`[CONTACT] ${id} Supabase insert successful (${Date.now() - tDb}ms)${saved.duplicate ? ' - row already existed' : ''}`);

        if (saved.duplicate) {
            // Row already exists (e.g. saved by an earlier attempt before a restart): never notify twice for one inquiry.
            const response = { success: true, ok: true, id, saved: true, duplicate: true, message: MSG.ok };
            store.finish(id, response);
            return res.status(200).json(response);
        }

        // ---- 2. exactly ONE admin notification email (never to the customer)
        const job = mailQueue.enqueue({ ...s, id, submittedAt: new Date() });
        const state = await Promise.race([job, new Promise((r) => setTimeout(() => r(null), emailWaitMs))]);
        let status = 200, response;
        if (state === 'sent') {
            response = { success: true, ok: true, id, saved: true, notified: true, message: MSG.ok };
        } else if (state === 'failed') {
            // The inquiry is saved and visible in the Admin Panel; only the notification failed (logged above).
            response = { success: true, ok: true, id, saved: true, notified: false, message: MSG.ok };
        } else {
            status = 202;
            response = { success: true, ok: true, id, saved: true, notificationPending: true, message: MSG.ok };
            log.warn(`[CONTACT] ${id} notification still in progress after ${emailWaitMs}ms; answered and continuing in background`);
        }
        store.finish(id, response);
        log.info(`[CONTACT] ${id} request completed in ${Date.now() - t0}ms -> HTTP ${status} (notification=${state || 'pending'})`);
        return res.status(status).json(response);
    });

    router.get('/contact/:id/status', (req, res) => {
        const id = String(req.params.id || '').toLowerCase();
        if (!UUID.test(id)) return res.status(400).json({ ok: false, message: 'Invalid id.' });
        const e = store.get(id);
        if (!e || !e.notification) return res.status(404).json({ ok: false, message: 'Unknown submission.' });
        res.set('Cache-Control', 'no-store');
        return res.json({ ok: true, id, notification: e.notification });
    });

    return router;
}
