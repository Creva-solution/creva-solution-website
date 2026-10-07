// Reads configuration from environment variables (Render Dashboard -> Environment). Values are never logged.

function required(name) {
    const v = (process.env[name] || '').trim();
    if (!v) throw new Error(`Missing required environment variable ${name}`);
    return v;
}

export function loadConfig() {
    // Email delivery: "resend" (HTTPS API, works on Render Free) or "smtp" (GoDaddy SMTP, needs a paid instance,
    // because Render Free blocks outbound ports 25/465/587). Defaults to resend when RESEND_API_KEY is set.
    const provider = (process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? 'resend' : 'smtp')).trim().toLowerCase();
    if (!['resend', 'smtp'].includes(provider)) throw new Error('EMAIL_PROVIDER must be "resend" or "smtp"');
    const port = Number(process.env.SMTP_PORT || 465);
    return {
        port: Number(process.env.PORT) || 10000,
        isProduction: process.env.NODE_ENV === 'production',
        supabase: {
            url: required('SUPABASE_URL'),
            anonKey: required('SUPABASE_ANON_KEY')
        },
        provider,
        resend: provider === 'resend' ? {
            apiKey: required('RESEND_API_KEY'),
            timeoutMs: Number(process.env.RESEND_TIMEOUT_MS) || 15000
        } : null,
        smtp: provider === 'smtp' ? {
            host: required('SMTP_HOST'),
            port,
            secure: (process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true',
            user: required('SMTP_USER'),
            password: required('SMTP_PASSWORD'),
            connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 30000,
            greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 30000,
            socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 60000,
            // Only for local tests against a self-signed SMTP server; never set in production.
            allowSelfSigned: process.env.SMTP_ALLOW_SELF_SIGNED === 'true' && process.env.NODE_ENV !== 'production'
        } : null,
        mail: {
            from: required('MAIL_FROM'),
            fromName: (process.env.MAIL_FROM_NAME || 'Creva Solutions').trim(),
            // one or more recipients for the new-inquiry notification, comma-separated
            admin: required('ADMIN_EMAIL').split(',').map((s) => s.trim()).filter(Boolean),
            siteUrl: (process.env.SITE_URL || 'https://crevasolution.in/').trim()
        },
        emailWaitMs: Number(process.env.EMAIL_WAIT_MS) || 15000,             // how long a request waits for the emails
        retryDelaysMs: [5000, 20000, 60000],                                  // email retries on temporary errors
        rateLimitPerWindow: Number(process.env.CONTACT_RATE_LIMIT) || 10,   // submissions per IP per 15 minutes
        allowedOrigins: (process.env.ALLOWED_ORIGINS || 'https://crevasolution.in')
            .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)
    };
}
