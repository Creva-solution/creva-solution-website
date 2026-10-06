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

The API answers as soon as the inquiry is saved (about 1 s). The two emails are then sent in the background over
one pooled, pre-warmed SMTP connection, strictly in this order: admin notification (retried on temporary errors:
after 5 s, 20 s, 60 s) and only after it was sent, the customer acknowledgement (same retries).

| Response | When |
|---|---|
| `200 {"ok":true,"saved":true,"emailQueued":true}` | saved; emails are being sent |
| `200/202 … "duplicate":true` | same submission id again (double click / retry) – nothing saved or sent twice |
| `400 {"ok":false,"errors":{…}}` | validation failed – nothing saved |
| `403` | browser request from another website |
| `429` | more than 10 submissions per IP per 15 minutes |
| `502 {"ok":false}` | Supabase insert failed – **no email sent** |

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
> **Plan:** Render **Free** instances cannot send email (outbound ports 25, 465 and 587 are blocked) and sleep after
> 15 minutes. Use **Starter** (or higher) for this service.

### Option A – Blueprint (uses `render.yaml`)
1. Push this repository to GitHub.
2. Render Dashboard → **New → Blueprint** → select the repository → Apply.
3. When asked, enter the two secret values: `SUPABASE_ANON_KEY` and `SMTP_PASSWORD`.

### Option B – manual Web Service
Render Dashboard → **New → Web Service** → connect the repository, then:
- **Root Directory:** `backend`
- **Runtime:** Node · **Build Command:** `npm install` · **Start Command:** `npm start`
- **Instance type:** Starter · **Health Check Path:** `/health`
- **Environment variables:**

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | `https://xtivwelnoccdontbrxft.supabase.co` |
| `SUPABASE_ANON_KEY` | the public anon key (same as in `admin/js/config.js`) |
| `SMTP_HOST` | `smtpout.secureserver.net` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `info@crevasolution.in` |
| `SMTP_PASSWORD` | the mailbox password |
| `MAIL_FROM` | `info@crevasolution.in` |
| `MAIL_FROM_NAME` | `Creva Solutions` |
| `ADMIN_EMAIL` | `info@crevasolution.in` |
| `ALLOWED_ORIGINS` | `https://crevasolution.in` |

`PORT` is set by Render automatically; the server uses it (defaults to 10000 locally).

### After deploying
1. Open `https://<your-service>.onrender.com/health` → `{"status":"ok"}`.
2. Render → Logs should show `SMTP connection verified` (if not, check the mailbox password / GoDaddy SMTP access).
3. Live service: `https://crevabackend.onrender.com`. If the service URL ever changes, update `CONTACT_API_URL` at the top of
   `js/contact-submission.js` in the website and push.
4. Submit the contact form with **your own** test address and check: Admin Panel → Inquiries, the
   "New Contact Inquiry" email in info@crevasolution.in, then the "Thank You" email in your inbox
   (Gmail → *Show original*: `From: Creva Solutions <info@crevasolution.in>`, `SPF: PASS`).

## Local development
```bash
cd backend
cp .env.example .env      # fill in the values
npm install
npm run dev               # http://localhost:10000/health
npm test                  # 15 end-to-end tests with a local SMTP server and a fake Supabase API
```
