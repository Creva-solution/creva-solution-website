# Creva Solutions – Contact API (Render)

Separate Node.js backend for the website contact form. It runs on **Render**; the website only calls its API.

```
crevasolution.in/contact.html ──► POST https://crevabackend.onrender.com/api/contact
                                        │ 1. validate
                                        │ 2. save → Supabase public.contact_submissions (existing table, unchanged)
                                        │ 3. ONE notification email → ADMIN_NOTIFICATION_EMAIL (crevasolution@gmail.com)
                                        ▼ 4. JSON response → the website shows its normal success message
```

**The customer never receives any email.** Their address is only stored in `contact_submissions` (and shown in the
Admin Panel). There is exactly one automatic email per successful submission: the notification to the Creva team.

## Structure
```
backend/
├── src/
│   ├── server.js              Express app: helmet, CORS, rate limit, /health, /api routes
│   ├── config.js              environment variables (fails fast if one is missing; never logs values)
│   ├── routes/contact.js      POST /api/contact (save → notification → response), GET /api/contact/:id/status
│   ├── services/supabase.js   insert into contact_submissions (anon key; duplicate id = already saved)
│   ├── services/email.js      notification template + SMTP (Nodemailer, pooled) or Resend API delivery
│   ├── services/mailQueue.js  sends notifications one at a time, retries temporary errors
│   ├── services/submissions.js duplicate protection + notification state (in memory, 24 h)
│   └── validation/contact.js  server-side validation (same rules as the website)
├── test/contact.test.js       end-to-end tests with a local SMTP server and a fake Supabase API
├── test/resend.test.js        end-to-end tests with a fake Resend API
├── test/browser-e2e.mjs       optional browser test of contact.html against this API
└── package.json  .env.example  .gitignore  .node-version  README.md
```

## API
**`GET /health`** → `200 {"status":"ok"}`

**`POST /api/contact`** (`Content-Type: application/json`, Origin must be `https://crevasolution.in`)
```json
{ "id": "browser-generated UUID", "name": "Customer Name", "email": "customer@gmail.com",
  "mobile": "9876543210", "service": "Web Development", "message": "Customer message" }
```
| Response | When |
|---|---|
| `200 {"success":true,"saved":true,"notified":true}` | saved, notification sent |
| `200 {"success":true,"saved":true,"notified":false}` | saved, notification failed (logged; inquiry is in the Admin Panel) |
| `202 {"success":true,"saved":true,"notificationPending":true}` | saved; mail provider slower than `EMAIL_WAIT_MS`, sending continues |
| `200/202 … "duplicate":true` | same submission id again (double click / retry) – nothing saved or sent twice |
| `400 {"success":false,"errors":{…}}` | validation failed – nothing saved |
| `403` / `429` | other website / more than 10 submissions per IP per 15 min |
| `502 {"success":false}` | Supabase insert failed – **no email sent** |

**`GET /api/contact/:id/status`** → `{"notification":"queued|sending|sent|failed"}` (no error details).

Responses never contain SMTP, Supabase or stack-trace details; those go to the Render logs only:
```
[CONTACT] request received
[CONTACT] <id> validation passed (1ms)
[CONTACT] <id> Supabase insert started
[CONTACT] <id> Supabase insert successful (180ms)
[CONTACT] <id> admin notification email started
[CONTACT] <id> admin notification email sent in 900ms
[CONTACT] <id> request completed in 1100ms -> HTTP 200 (notification=sent)
```

## Notification email
| | |
|---|---|
| To | `ADMIN_NOTIFICATION_EMAIL` (crevasolution@gmail.com) – nobody else, no CC/BCC |
| From | `MAIL_FROM_NAME <MAIL_FROM>` (MAIL_FROM defaults to `SMTP_USER`) – nothing hard-coded |
| Reply-To | the customer, so *Reply* in Gmail writes to them manually |
| Subject | `New Contact Inquiry – CUSTOMER NAME` |
| Body | Customer Name, Customer Email, Mobile, Service, Message, Submitted Date/Time (IST), "Please check the Admin Panel for this inquiry." |

## Supabase
Uses the existing table `public.contact_submissions` with the **public anon key** (the existing RLS policy allows
the anon role to INSERT only). No service-role key, no table or policy changes. The Admin Panel keeps reading the same table.

## Duplicate protection
The website creates one UUID per inquiry and sends it on every attempt. The database primary key rejects a second
insert with the same id, so double clicks, retries, the website's fallback path and server restarts never create a
second row, and a repeated id never triggers a second notification (Resend also gets an `Idempotency-Key`).

## Security
Secrets only in Render environment variables (`.env` is git-ignored); CORS only `https://crevasolution.in`;
Helmet headers; 20 KB body limit; rate limit; honeypot field; all email values HTML-escaped and single-lined;
logs never include passwords or keys.

---

## Deploy on Render
> **Important – Render Free blocks outbound SMTP ports 25, 465 and 587.** With `EMAIL_PROVIDER=smtp` the
> notification can only be sent from a **paid** instance (Starter or higher). On the Free plan use
> `EMAIL_PROVIDER=resend` (HTTPS). Free instances also sleep after 15 minutes; see "Keep the service awake".

### Environment variables (service `crevabackend` → Environment)
| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | `https://xtivwelnoccdontbrxft.supabase.co` |
| `SUPABASE_ANON_KEY` | the public anon key (same as in `admin/js/config.js`) |
| `ADMIN_NOTIFICATION_EMAIL` | `crevasolution@gmail.com` |
| `EMAIL_PROVIDER` | `smtp` (paid instance) or `resend` (Free plan) |
| `MAIL_FROM_NAME` | e.g. `Creva Solutions Website` |
| `MAIL_FROM` | sender address (SMTP: defaults to `SMTP_USER`; Resend: see below) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASSWORD` | the SMTP account that sends the notification (smtp only) |
| `RESEND_API_KEY` | `re_…` (resend only) |
| `ALLOWED_ORIGINS` | `https://crevasolution.in` |
| `EMAIL_WAIT_MS` | optional, default `15000` |

Remove the old `ADMIN_EMAIL` variable (no longer used). `PORT` is set by Render.

**SMTP example** (sender account; password only in Render) – Gmail account `crevasolution@gmail.com`:
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=crevasolution@gmail.com`,
`SMTP_PASSWORD=` a Google **App Password** (Google Account → Security → 2-Step Verification → App passwords).

**Resend on the Free plan** (no SMTP): create a free account at <https://resend.com> **using the address
crevasolution@gmail.com**, create an API key, and set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=re_…`,
`MAIL_FROM=onboarding@resend.dev`. Resend's test sender only delivers to the account's own address – which is
exactly crevasolution@gmail.com – so no DNS setup is needed. (A sender on your own domain requires verifying the domain in Resend.)

### Deploy
Render → service → **Manual Deploy → Deploy latest commit**, or enable **Auto-Deploy** (Settings) so every push to
`main` deploys. Root Directory `backend`, Build `npm install`, Start `npm start`, Health Check Path `/health`.

### After deploying
1. `https://crevabackend.onrender.com/health` → `{"status":"ok"}`.
2. Render → Logs shows `[EMAIL] one admin notification per inquiry to 1 address(es); no customer emails` and, for
   SMTP, `[EMAIL] SMTP connection verified in …ms` (if it says `verify failed … ETIMEDOUT`, outbound SMTP is blocked).
3. Submit the contact form with a test address: Admin Panel → Inquiries shows it, crevasolution@gmail.com receives
   one "New Contact Inquiry" email, the test address receives nothing.

### Keep the service awake (Free plan)
A free instance sleeps after 15 minutes and the first request waits ~20–50 s for it to wake. The contact page pings
`/health` when it opens and the form waits up to 30 s plus one retry with the same id. To avoid the delay entirely,
add a free uptime monitor (UptimeRobot, cron-job.org) requesting `https://crevabackend.onrender.com/health` every
10 minutes.

## Local development
```bash
cd backend
cp .env.example .env      # fill in the values
npm install
npm run dev               # http://localhost:10000/health
npm test                  # end-to-end tests (local SMTP server, fake Resend and Supabase APIs)
```
