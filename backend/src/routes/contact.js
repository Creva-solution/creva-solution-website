// POST /api/contact               validate -> save to Supabase -> respond -> (background) admin email, then customer email
// GET  /api/contact/:id/status    email delivery state of one submission (no error details)
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { validateContact } from '../validation/contact.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Customer-facing messages only; internal Supabase/SMTP details are logged, never returned.
const MSG = {
    ok: 'Thank you! Your message has been sent successfully. We’ll get back to you soon.',
    error: 'We’re having trouble submitting your enquiry right now. Please try again in a moment.'
};

export function contactRouter({ supabase, mailQueue, store, log }) {
    const router = Router();

    router.post('/contact', async (req, res) => {
        const t0 = Date.now();
        const result = validateContact(req.body);
        if (!result.ok) {
            log.info(`[CONTACT] request rejected by validation (${Object.keys(result.errors).join(', ')})`);
            return res.status(400).json({ ok: false, message: 'Please check the form and try again.', errors: result.errors });
        }
        const s = result.value;
        const id = s.id || randomUUID();
        log.info(`[CONTACT] ${id} request received, validation completed in ${Date.now() - t0}ms`);

        if (result.spam) {                                   // honeypot filled: pretend success, store/send nothing
            log.info(`[CONTACT] ${id} honeypot triggered, ignored`);
            return res.status(200).json({ ok: true, id, message: MSG.ok });
        }

        // ---- duplicate protection (double click, browser/network/API retry with the same submission id)
        const seen = store.get(id);
        if (seen && seen.status === 'processing') return res.status(202).json({ ok: true, id, duplicate: true, message: MSG.ok });
        if (seen && seen.status === 'done') {
            log.info(`[CONTACT] ${id} repeated request, returning the stored result`);
            return res.status(200).json({ ...seen.response, duplicate: true });
        }
        store.start(id);

        // ---- 1. save (if this fails, no email is sent)
        const tDb = Date.now();
        let saved;
        try {
            saved = await supabase.insertSubmission({ id, ...s });
        } catch (e) {
            store.forget(id);
            log.error(`[CONTACT] ${id} Supabase insert failed after ${Date.now() - tDb}ms (${e.code || 'unknown'}): ${String(e.detail || '').slice(0, 120)}`);
            return res.status(502).json({ ok: false, id, message: MSG.error });
        }
        log.info(`[CONTACT] ${id} Supabase insert completed in ${Date.now() - tDb}ms${saved.duplicate ? ' (row already existed)' : ''}`);

        if (saved.duplicate) {
            // Row already exists (e.g. saved by an earlier attempt before a restart): never email twice for one inquiry.
            const response = { ok: true, id, saved: true, duplicate: true, message: MSG.ok };
            store.finish(id, response);
            return res.status(200).json(response);
        }

        // ---- 2. emails in the background: FIRST admin, then (only if sent) the customer
        mailQueue.enqueue({ ...s, id, submittedAt: new Date() });
        const response = { ok: true, id, saved: true, emailQueued: true, message: MSG.ok };
        store.finish(id, response);
        log.info(`[CONTACT] ${id} response sent after ${Date.now() - t0}ms (emails queued)`);
        return res.status(200).json(response);
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
