# Supabase Final Setup Guide

Follow these exact steps to complete your backend setup.

## Step 1: Run the SQL Script (Easiest Method)
This single script will create all your tables, policies, and storage buckets automatically.

1.  Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2.  Open your project.
3.  On the left sidebar, click on **SQL Editor** (icon looks like a terminal `>_`).
4.  Click **New Query**.
5.  **Copy and Paste** the entire content of the file `admin/schema.sql` into the editor.
6.  Click **Run** (bottom right).

*If it runs successfully, you don't need to do anything manually for tables or storage!*

---

## Step 2: Get Your Credentials
1.  In Supabase, go to **Project Settings** (gear icon at the bottom left).
2.  Click on **API**.
3.  Look for:
    *   **Project URL**
    *   **anon public** key
4.  Copy these two values.

## Step 3: Add Credentials to Your Project
1.  Open the file: `d:/Creva Company/creva solution(html,css)/admin/js/config.js`
2.  Paste your keys into the file like this:

```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_PUBLIC_KEY = 'your-very-long-anon-key-here';

// Initialize Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_PUBLIC_KEY);
```

---

## (Optional) Manual Verification
If you want to double-check that everything was created correctly:

### 1. Storage
Go to **Storage**. You should see a bucket named `site-assets`.
- Ensure it is set to **Public**.

### 2. Tables
Go to the **Table Editor**. You should see these tables with these specific columns:

**`clients` (Partners)**
- `name` (text)
- `logo_url` (text)
- `category` (text)
- `description` (text)
- `website_url` (text)

**`services`**
- `title` (text)
- `description` (text)
- `icon` (text)
- `category` (text)

**`team_members`**
- `name`, `role`, `bio` (text)
- `photo_url` (text)
- `linkedin_url`, `instagram_url`, `facebook_url` (text)

**`testimonials`**
- `name`, `role`, `quote` (text)
- `photo_url` (text)

**`contact_messages`**
- `name`, `email`, `service`, `message` (text)

---

## Step 4: Create Your Admin User
**Crucial Step**: You cannot log in or edit data without a user!

1.  Go to **Authentication** (sidebar).
2.  Click **Users**.
3.  Click **Add User**.
4.  Enter your **Email** and a **Secure Password**.
5.  Click **Create User**.
    *   *Note: If "Confirm Email" is enabled (default), you might need to click "Auto Confirm" in the row's success menu (three dots) if you don't want to set up real email sending yet.*

Now go to your Admin Panel (`admin/index.html`), login with these details, and you will have full **Write/Delete** access!
