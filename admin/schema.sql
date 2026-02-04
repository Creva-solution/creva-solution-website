-- 1. Storage Bucket Setup
-- Create a bucket for storing images (if not exists)
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

-- Set up security policies for the storage bucket
-- Allow public read access to everyone
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'site-assets' );

-- Allow authenticated users (Admin) to upload files
create policy "Authenticated Upload"
  on storage.objects for insert
  with check ( bucket_id = 'site-assets' and auth.role() = 'authenticated' );

-- Allow authenticated users (Admin) to delete files
create policy "Authenticated Delete"
  on storage.objects for delete
  using ( bucket_id = 'site-assets' and auth.role() = 'authenticated' );


-- 2. Database Tables Setup

-- A. Clients & Partners Table
create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  logo_url text not null,
  category text,       -- 'IT' or 'Civil'
  description text,    -- Quote or description
  website_url text     -- Link to partner website
);

-- B. Team Members Table
create table if not exists public.team_members (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  role text not null,
  bio text,            -- Short bio
  photo_url text,      -- Profile image URL
  linkedin_url text,
  instagram_url text,
  facebook_url text
);

-- C. Services Table
create table if not exists public.services (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  description text,
  icon text,           -- Lucide icon name (e.g., 'code', 'hammer')
  category text        -- 'IT' or 'Civil'
);

-- D. Testimonials Table
create table if not exists public.testimonials (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  role text,
  quote text not null,
  photo_url text
);

-- E. Contact Messages Table (Inquiries)
create table if not exists public.contact_messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  email text not null,
  service text,
  message text not null
);


-- 3. Row Level Security (RLS) & Policies
-- Enable RLS on all tables
alter table public.clients enable row level security;
alter table public.team_members enable row level security;
alter table public.services enable row level security;
alter table public.testimonials enable row level security;
alter table public.contact_messages enable row level security;

-- Policy Function: Allow Public Read, Auth Write (Insert/Update/Delete)
-- We'll repeat this pattern for each table.

-- Clients Policies
create policy "Allow public read clients" on public.clients for select using (true);
create policy "Allow auth insert clients" on public.clients for insert with check (auth.role() = 'authenticated');
create policy "Allow auth update clients" on public.clients for update using (auth.role() = 'authenticated');
create policy "Allow auth delete clients" on public.clients for delete using (auth.role() = 'authenticated');

-- Team Policies
create policy "Allow public read team" on public.team_members for select using (true);
create policy "Allow auth insert team" on public.team_members for insert with check (auth.role() = 'authenticated');
create policy "Allow auth update team" on public.team_members for update using (auth.role() = 'authenticated');
create policy "Allow auth delete team" on public.team_members for delete using (auth.role() = 'authenticated');

-- Services Policies
create policy "Allow public read services" on public.services for select using (true);
create policy "Allow auth insert services" on public.services for insert with check (auth.role() = 'authenticated');
create policy "Allow auth update services" on public.services for update using (auth.role() = 'authenticated');
create policy "Allow auth delete services" on public.services for delete using (auth.role() = 'authenticated');

-- Testimonials Policies
create policy "Allow public read testimonials" on public.testimonials for select using (true);
create policy "Allow auth insert testimonials" on public.testimonials for insert with check (auth.role() = 'authenticated');
create policy "Allow auth update testimonials" on public.testimonials for update using (auth.role() = 'authenticated');
create policy "Allow auth delete testimonials" on public.testimonials for delete using (auth.role() = 'authenticated');

-- Contact Messages Policies
-- NOTE: Contact messages are different!
-- Public can INSERT (send message), but ONLY Auth (Admin) can SELECT (read messages).
create policy "Allow public insert messages" on public.contact_messages for insert with check (true);
create policy "Allow auth read messages" on public.contact_messages for select using (auth.role() = 'authenticated');
create policy "Allow auth delete messages" on public.contact_messages for delete using (auth.role() = 'authenticated');
