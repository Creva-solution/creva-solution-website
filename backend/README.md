# Creva Solutions – Contact API (Render)

Separate Node.js backend for the website contact form. It runs on **Render**; the website only calls its API.

```
crevasolution.in/contact.html ──► POST https://<render-service>.onrender.com/api/contact
                                        │ 1. validate
                                        │ 2. save  → Supabase public.contact_submissions (existing table, unchanged)
                                        │ 3. FIRST  → email to info@crevasolution.in   "New Contact Inquiry – NAME"
                                        │ 4. SECOND → email to the lead (only if 3 succeeded)  "Thank You for Contacting Creva Solutions"
                                        ▼ 5. JSON response → the website shows its normal success message
```

## Structure
```
backend/
├── src/
│   ├── server.js              Express app: helmet, CORS, rate limit, /health, /api routes
│   ├── config.js              environment variables (fails fast if one is missing; never logs values)
│   ├── routes/contact.js      POST /api/contact – the save → admin email → customer email flow
│   ├── services/supabase.js   insert into contact_submissions (anon key; duplicate id = already saved)
│   ├── services/email.js      Nodemailer + both email templates (text + HTML)
│   ├── services/submissions.js  duplicate protection + per-recipient acknowledgement limit (in memory)
│   └── validation/contact.js  server-side validation (same rules as the website)
├── test/contact.test.js       15 end-to-end tests (npm test)
├── test/browser-e2e.mjs       optional browser test of contact.html against this API
├── package.json  .env.example  .gitignore  .node-version
└── README.md
```
`render.yaml` (repository root) is a Render Blueprint for this service.

## API
**`GET /health`** → `200 {"status":"ok"}`

**`POST /api/contact`** (`Content-Type: application/json`, Origin must be `https://crevasolution.in`)
```json
{ "id": "browser-generated UUID", "name": "Customer Name", "email": "customer@gmail.com",
  "mobile": "9876543210", "service": "Web Development", "message": "Customer message" }
```
`service` is required because `contact_submissions.service` is NOT NULL. `id` is optional but the website always
sends one (duplicate protection). Mobile numbers are normalised to `+91 XXXXXXXXXX`.

Order: save → admin notification → (only if sent) customer acknowledgement → response. Emails use one pooled,
pre-warmed SMTP connection and are retried on temporary errors. The request waits for the emails up to
`EMAIL_WAIT_MS` (default 15000); if SMTP is slower, it answers `202` (inquiry saved) and the emails finish in the
background in the same order.

| Response | When |
|---|---|
| `200 {"success":true,"saved":true,"adminEmail":true,"customerEmail":true}` | CASE 4 – saved, both emails sent |
| `200 {"success":true,…,"adminEmail":true,"customerEmail":false}` | CASE 3 – customer email failed (admin not re-sent) |
| `502 {"success":false,"saved":true}` | CASE 2 – saved, admin email failed, no customer email; sending again with the same id re-sends the emails only |
| `502 {"success":false}` (no `saved`) | CASE 1 – Supabase insert failed – **no email sent** |
| `202 {"success":true,"saved":true,"emailPending":true}` | saved; SMTP slower than `EMAIL_WAIT_MS`, emails continue |
| `200/202 … "duplicate":true` | same submission id again (double click / retry) – nothing saved or sent twice |
| `400 {"success":false,"errors":{…}}` | validation failed – nothing saved |
| `403` | browser request from another website |
| `429` | more than 10 submissions per IP per 15 minutes |

**`GET /api/contact/:id/status`** → `{"admin":"queued|sending|sent|failed","customer":"queued|sending|sent|failed|not_sent|limited"}`
for one submission (kept 24 h in memory; no error details). `not_sent` = the admin email failed, so no acknowledgement.

Render logs show each stage with timings, e.g.
`[CONTACT] <id> Supabase insert completed in 140ms`, `[CONTACT] <id> admin email sent in 2300ms`,
`[CONTACT] <id> customer email sent in 310ms`, and at startup `[SMTP] connection verified in …ms`.

Responses never contain SMTP, Supabase or stack-trace details; those go to the Render logs only.

## Email
| | Admin notification (sent FIRST) | Customer acknowledgement (sent SECOND) |
|---|---|---|
| From | `Creva Solutions <info@crevasolution.in>` | `Creva Solutions <info@crevasolution.in>` |
| To | `info@crevasolution.in` | the email entered in the form |
| Reply-To | the lead (pressing Reply answers the customer) | – |
| Subject | `New Contact Inquiry – NAME` | `Thank You for Contacting Creva Solutions` |

**SMTP (verified, not assumed):** crevasolution.in uses GoDaddy email (MX `smtp.secureserver.net`,
SPF `include:secureserver.net -all`; not Microsoft 365). Outgoing server checked live:
`smtpout.secureserver.net`, port **465**, implicit SSL (TLS 1.3), `AUTH LOGIN PLAIN`. Sending through GoDaddy also
passes the domain's strict SPF.

## Supabase
Uses the existing table `public.contact_submissions` with the **public anon key**. The existing RLS policy lets
the anon role INSERT only, which is all this API needs, so a leaked Render key could not read or delete inquiries.
No service-role key is used. No table or policy changes.

## Duplicate protection
The website creates one UUID per inquiry and sends it on every attempt. The database primary key rejects a second
insert with the same id, so double clicks, browser/network retries, the website's fallback path and server
restarts can never create a second row. If a repeated id arrives, no email is sent again.

## Security
- Secrets only in Render environment variables; `.env` is git-ignored; nothing secret in the website code.
- CORS allows only `https://crevasolution.in` (`www.` 301-redirects there; verified). Other browser origins get `403`.
- Helmet security headers, 20 KB body limit, rate limit 10 / 15 min per IP, honeypot field for bots.
- The acknowledgement goes to an address typed into a public form, so it contains no visitor text except a plausible
  name (links/symbols → "Hi there"), and is limited to 3 per address per day (the admin email is still sent).
- Logs mask email addresses and never include passwords or keys.

---

## Deploy on Render
> **Plan:** this service runs on Render **Free**. Render Free blocks outbound SMTP ports (25, 465, 587), so email is
> sent through the **Resend** HTTPS API (`EMAIL_PROVIDER=resend`), still from `Creva Solutions <info@crevasolution.in>`.
> Free instances also sleep after 15 minutes without traffic; the first request then waits ~20–50 s for the wake-up
> (see "Keep the service awake" below). On a paid instance you can switch to GoDaddy SMTP with `EMAIL_PROVIDER=smtp`.

### 1. Resend (once)
1. Create a free account at <https://resend.com> (3,000 emails/month, 100/day).
2. **Domains → Add Domain** → `crevasolution.in` (region closest to you).
3. Resend shows DNS records (a DKIM `TXT` record `resend._domainkey`, and an `MX` + `TXT` (SPF) record on the
   `send` subdomain). Add **exactly those** in **GoDaddy → My Products → crevasolution.in → DNS → Add New Record**.
   They do **not** touch the existing root SPF (`include:secureserver.net`) or the MX records of your mailbox, so
   info@crevasolution.in keeps receiving mail as before.
4. Back in Resend, click **Verify DNS Records** and wait until the domain shows **Verified** (minutes to a few hours).
5. **API Keys → Create API Key** → permission **Sending access**, domain `crevasolution.in` → copy the key (`re_…`).

### 2. Render environment variables (service `crevabackend` → Environment)
| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | `https://xtivwelnoccdontbrxft.supabase.co` |
| `SUPABASE_ANON_KEY` | the public anon key (same as in `admin/js/config.js`) |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | the `re_…` key from step 1.5 (secret) |
| `MAIL_FROM` | `info@crevasolution.in` |
| `MAIL_FROM_NAME` | `Creva Solutions` |
| `ADMIN_EMAIL` | `info@crevasolution.in` (several allowed, comma-separated, e.g. `info@crevasolution.in,crevasolution@gmail.com`) |
| `ALLOWED_ORIGINS` | `https://crevasolution.in` |
| `EMAIL_WAIT_MS` | optional, default `15000` |

The `SMTP_*` variables are only needed with `EMAIL_PROVIDER=smtp` and can be removed. `PORT` is set by Render.

### 3. Deploy
Render → service → **Manual Deploy → Deploy latest commit** (or enable **Auto-Deploy** in Settings so every push to
`main` deploys). Service settings: Root Directory `backend`, Build `npm install`, Start `npm start`,
Health Check Path `/health`. (`render.yaml` in the repository root describes the same service as a Blueprint.)

### 4. After deploying
1. `https://crevabackend.onrender.com/health` → `{"status":"ok"}`.
2. Render → Logs shows `[EMAIL] provider resend (HTTPS API); sender info@crevasolution.in, …`.
3. Submit the contact form with **your own** address and check Admin Panel → Inquiries, the "New Contact Inquiry"
   email, then the "Thank You" email (Gmail → *Show original*: `From: Creva Solutions <info@crevasolution.in>`,
   `DKIM: PASS` for crevasolution.in). Resend → **Emails** lists every message with its delivery status.
4. Render logs show each step: `[CONTACT] … Supabase insert completed in …ms`, `admin email sent in …ms`,
   `customer email sent in …ms`, `request completed in …ms -> HTTP 200`.

### Keep the service awake (recommended on Free)
A free instance sleeps after 15 minutes; the website pings `/health` when the contact page opens to start waking it,
and the form waits up to 30 s plus one retry. To avoid the wake-up delay entirely, add a free uptime monitor
(for example UptimeRobot or cron-job.org) that requests `https://crevabackend.onrender.com/health` every 10 minutes.
One always-on free service uses about 720 of Render's 750 free instance hours per month.

## Local development
```bash
cd backend
cp .env.example .env      # fill in the values
npm install
npm run dev               # http://localhost:10000/health
npm test                  # 25 end-to-end tests (local SMTP server, fake Resend and Supabase APIs)
```
