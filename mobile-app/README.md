# Creva Admin – React Native Android app

Native Admin App for Creva Solutions (React Native 0.86 + Expo SDK 57). It uses the **same Supabase project,
logins and data** as the web Admin Panel, and receives **Firebase Cloud Messaging push notifications** for every new
website contact submission.

```
Website contact form ──► public.contact_submissions (INSERT)
                              │
              ┌───────────────┴────────────────┐
              ▼                                ▼
     Supabase Realtime                 Database Webhook
   (web panel + app while open)              │
                                              ▼
                               Edge Function send-admin-push  (../supabase/functions)
                                              │  FCM HTTP v1 (server-side credentials only)
                                              ▼
                                Creva Admin app ─► 🔔 push notification
```

- **Package name:** `com.crevasolution.admin` · **App name:** Creva Admin
- **Push:** `@react-native-firebase/messaging` (native Firebase SDK). Android shows the notification itself when the
  app is in the background, closed or the phone is locked. Tap → `getInitialNotification` / `onNotificationOpenedApp`
  open that inquiry by `submission_id`.
- **No secrets in the app:** only the public Supabase URL + anon key, read at build time from `../admin/js/config.js`
  (the build refuses a service_role key). Firebase server credentials live only in Supabase secrets.
- **Without `google-services.json`** the app still builds and works (login, dashboard, inquiries, live updates);
  push is switched off and the Firebase native modules are not linked, so nothing can crash.

## Screens
Splash → Login → (Notification permission) → tabs **Dashboard · Inquiries · Alerts · Settings**, plus **Inquiry details**
(Call, Email, Copy mobile, Copy email). Non-admins (not in `public.admin_users`) see "Access restricted" and load no data.

---

## 1. Supabase (once) – SQL Editor
| File | Purpose |
|---|---|
| `admin/blog_setup.sql` (already run) | `admin_users` allowlist + `is_admin()`. Your admin e-mail must be in `admin_users`. |
| `admin/realtime_setup.sql` | Realtime for `contact_submissions` (instant updates while the app/web panel is open). |
| `admin/push_setup.sql` | `admin_push_tokens` + RLS + `register_admin_push_token` / `unregister_admin_push_token` / `get_admin_push_tokens`. |

Recommended: Authentication → Sign In / Providers → turn off **Allow new users to sign up**.

## 2. Firebase (once)
1. <https://console.firebase.google.com> → Add project.
2. Add app → **Android** → package name **`com.crevasolution.admin`**.
3. Download **`google-services.json`** → save as `mobile-app/google-services.json` (git-ignored).
4. Project settings → Cloud Messaging → *Firebase Cloud Messaging API (V1)* must be **Enabled**.
5. Project settings → Service accounts → **Generate new private key** (or a dedicated service account with role
   *Firebase Cloud Messaging API Admin*). Use the JSON as the Supabase secret `FCM_SERVICE_ACCOUNT`, then delete the file.

## 3. Edge Function, secrets and webhook (once)
```bash
# from the repository root, with the Supabase CLI
supabase login
supabase link --project-ref xtivwelnoccdontbrxft
supabase secrets set WEBHOOK_SECRET=PASTE-A-LONG-RANDOM-STRING
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat path/to/service-account.json)"
supabase functions deploy send-admin-push --no-verify-jwt
```
Database → Webhooks → Create: table `public.contact_submissions`, event **Insert**, type **Supabase Edge Functions** →
`send-admin-push`, POST, header **`x-webhook-secret`** = your `WEBHOOK_SECRET`.

## 4. Build the APK
Needs Node 22+, JDK 17–21 and the Android SDK (install **Android Studio**; it includes both).

```bash
cd mobile-app
npm install
npx expo prebuild --platform android --clean     # generates ./android from app.config.js (re-run after config changes)
cd android
gradlew.bat assembleRelease      # Windows
./gradlew assembleRelease        # macOS / Linux
# -> android/app/build/outputs/apk/release/app-release.apk
```
The release APK is signed with Expo's default debug key: fine for installing on your own phones.
For the Play Store, create your own key and build an **AAB** (`gradlew bundleRelease`) signed with it
(see <https://reactnative.dev/docs/signed-apk-android>), or use EAS Build:
`npx eas-cli build -p android --profile production` (cloud build, no local SDK needed; requires a free Expo account).

Faster local builds for real phones only: add `-PreactNativeArchitectures=arm64-v8a,armeabi-v7a`.

**Adding push later:** put `google-services.json` in `mobile-app/`, run `npx expo prebuild --platform android --clean`
and build again. The app detects it at build time.

## 5. Behaviour
| Situation | Result |
|---|---|
| Notification permission | First-run screen explains why, then the Android 13+ `POST_NOTIFICATIONS` dialog. Blocked → "Open app settings". |
| Device registration | FCM token stored server-side via `register_admin_push_token` (admins only); refreshed on start/resume and on Firebase token rotation; removed on logout. |
| App open | Supabase Realtime + in-app banner; foreground pushes de-duplicated by inquiry id. |
| Background / closed / locked | Android shows "🔔 New Contact Inquiry – New inquiry received from NAME. Tap to view." (channel `inquiries`, private on lock screen). |
| Tap | Opens the app on that inquiry (also from fully closed). |
| No internet | Clear message, pull-to-refresh/Retry, last saved list; admin access re-checked when back online. |

Notification payload: name in the text only; data `{"type":"contact_submission","submission_id":"<uuid>"}`.

> Android: **Settings → Apps → Force stop** blocks all notifications for that app until it is opened again
> (Android rule). Swiping the app away from Recents does not.

## 6. Device test checklist
1. Install → log in → **Allow** notifications → `SELECT device_name, updated_at FROM admin_push_tokens;` shows the phone.
2. Home button → submit the website form → notification; row in `contact_submissions`.
3. Tap → app opens on that inquiry (same ID).
4. App open → submit → list updates instantly + banner, no duplicate.
5. Lock phone → submit → lock-screen notification.
6. Swipe app away → submit → notification; tap opens the inquiry.
7. Second admin phone → submit once → both receive it.
8. Uninstall/reinstall → log in → works; Edge Function logs show `"removed":1` for the old token.
