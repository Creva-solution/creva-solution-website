// Creva Solutions contact API (Render web service).
//   GET  /health        -> {"status":"ok"}
//   POST /api/contact   -> save to Supabase, then admin email, then customer email
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createSupabaseService } from './services/supabase.js';
import { createEmailService } from './services/email.js';
import { createSubmissionStore } from './services/submissions.js';
import { contactRouter } from './routes/contact.js';

const log = {
    info: (m) => console.log(new Date().toISOString(), 'INFO', m),
    warn: (m) => console.warn(new Date().toISOString(), 'WARN', m),
    error: (m) => console.error(new Date().toISOString(), 'ERROR', m)
};

export function createApp(config, deps = {}) {
    const supabase = deps.supabase || createSupabaseService(config.supabase);
    const email = deps.email || createEmailService(config.smtp, config.mail);
    const store = deps.store || createSubmissionStore();
    const logger = deps.log || log;

    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);                            // Render sits behind one proxy: real client IP for rate limiting
    app.use(helmet());

    // CORS: only the production website (https://www.crevasolution.in 301-redirects to https://crevasolution.in).
    const corsMw = cors({
        origin(origin, cb) { cb(null, !!origin && config.allowedOrigins.includes(origin)); },
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        maxAge: 86400
    });

    // Health check (Render) – also callable from the website to wake the service; returns nothing sensitive.
    app.get('/health', corsMw, (_req, res) => res.json({ status: 'ok' }));

    const contactLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, limit: config.rateLimitPerWindow || 10, standardHeaders: 'draft-8', legacyHeaders: false,
        message: { ok: false, message: 'Too many submissions. Please try again later or contact us directly.' }
    });

    app.use('/api', corsMw);
    app.options('/api/contact', corsMw);
    // Browsers on other sites are refused before any work is done (CORS alone only hides the response).
    app.use('/api', (req, res, next) => {
        const origin = req.get('origin');
        if (origin && !config.allowedOrigins.includes(origin)) return res.status(403).json({ ok: false, message: 'Origin not allowed.' });
        next();
    });
    app.use('/api', express.json({ limit: '20kb' }));
    app.use('/api/contact', contactLimiter);
    app.use('/api', contactRouter({ supabase, email, store, log: logger }));

    app.use((_req, res) => res.status(404).json({ ok: false, message: 'Not found.' }));
    // Errors (e.g. malformed JSON): generic message only, no stack traces or internals.
    app.use((err, _req, res, _next) => {
        const status = err.status || err.statusCode || 500;
        if (status >= 500) logger.error(`unhandled error: ${err.message}`);
        res.status(status).json({ ok: false, message: status === 400 ? 'Invalid request.' : 'Something went wrong. Please try again.' });
    });
    return { app, email };
}

// Start only when run directly (npm start), not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    let config;
    try { config = loadConfig(); } catch (e) { log.error(e.message); process.exit(1); }
    const { app, email } = createApp(config);
    const server = app.listen(config.port, () => {
        log.info(`creva-contact-api listening on port ${config.port}; allowed origins: ${config.allowedOrigins.join(', ')}`);
        email.verify().then(() => log.info('SMTP connection verified')).catch((e) => log.error(`SMTP verify failed: ${e.message}`));
    });
    const shutdown = () => { server.close(() => { email.close(); process.exit(0); }); setTimeout(() => process.exit(0), 10000).unref(); };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
