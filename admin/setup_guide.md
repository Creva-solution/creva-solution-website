# Supabase Manual Setup Guide (No-Code)

If you prefer not to run the SQL script, you can set up your project manually using the Supabase Dashboard.

## 1. Storage Setup (For Images)
1.  Go to **Storage** in the left sidebar.
2.  Click **New Bucket**.
3.  Name it: `site-assets`.
4.  Toggle **Public Bucket** to ON.
5.  Click **Save**.

## 2. Database Tables
Go to the **Table Editor** (icon looking like a spreadsheet) in the left sidebar.

### Create `clients` Table
1.  Click **New Table**.
2.  Name: `clients`.
3.  Enable **Row Level Security (RLS)** (checked by default).
4.  Columns:
    - `id`: uuid, Primary Key to ON (default).
    - `created_at`: timestamp (default).
    - Click **Add Column**: Name `name`, Type `text`.
    - Click **Add Column**: Name `logo_url`, Type `text`.
    - Click **Add Column**: Name `category`, Type `text` (e.g., 'IT', 'Civil').
    - Click **Add Column**: Name `website_url`, Type `text`.
    - Click **Add Column**: Name `description`, Type `text` (for the quote/popup).
5.  Click **Save**.

### Create `testimonials` Table
1.  Click **New Table**.
2.  Name: `testimonials`.
3.  Columns:
    - `id`: uuid, Primary Key.
    - `created_at`: timestamp.
    - `name`: text.
    - `role`: text.
    - `quote`: text.
    - `photo_url`: text.
4.  Click **Save**.

### Create `team_members` Table
1.  Click **New Table**.
2.  Name: `team_members`.
3.  Columns:
    - `id`: uuid, Primary Key.
    - `created_at`: timestamp.
    - `name`: text.
    - `role`: text.
    - `bio`: text.
    - `photo_url`: text.
    - `linkedin_url`: text.
    - `instagram_url`: text.
    - `facebook_url`: text.
4.  Click **Save**.

### Create `services` Table
1.  Click **New Table**.
2.  Name: `services`.
3.  Columns:
    - `id`: uuid, Primary Key.
    - `created_at`: timestamp.
    - `title`: text.
    - `description`: text.
    - `icon`: text (e.g. 'code', 'hammer', 'smartphone').
    - `category`: text (e.g. 'IT', 'Civil').
4.  Click **Save**.

### Create `contact_messages` Table
1.  Click **New Table**.
2.  Name: `contact_messages`.
3.  Columns:
    - `id`: uuid, Primary Key.
    - `created_at`: timestamp.
    - `name`: text.
    - `email`: text.
    - `service`: text.
    - `message`: text.
4.  Click **Save**.

## 3. Policies (Permissions)
*This allows the admin panel to actually write data.*

1.  Go to **Authentication** > **Policies**.
2.  For each table (`clients`, `testimonials`, `team_members`), click **New Policy**.
3.  Choose **"Get started quickly"** (Templates).
4.  Select **"Enable read access to everyone"**. Click Use Template -> Review -> Save.
5.  Select **"Enable insert access for authenticated users only"**. Click Use Template -> Review -> Save.
6.  Select **"Enable delete access for authenticated users only"**. Click Use Template -> Review -> Save.

---

## 4. Connect to Admin Panel
Once created, don't forget to:
1.  Go to **Project Settings** > **API**.
2.  Copy **Project URL** and **anon public** key.
3.  Paste them into `d:/Creva Company/creva solution(html,css)/admin/js/config.js`.
