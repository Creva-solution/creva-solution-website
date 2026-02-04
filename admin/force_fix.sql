-- FORCE FIX ALL POLICIES
-- Run this ENTIRE SCRIPT in the Supabase SQL Editor.
-- It will completely reset permissions to ensure the Admin Panel works.

-- ==========================================
-- 1. STORAGE PERMISSIONS (Fixes Image Uploads)
-- ==========================================
-- Ensure bucket exists
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

-- Drop ALL existing storage policies for this bucket to start fresh
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated Upload" on storage.objects;
drop policy if exists "Authenticated Delete" on storage.objects;
drop policy if exists "Public Access Site Assets" on storage.objects; -- specific drop just in case
drop policy if exists "Auth Upload Site Assets" on storage.objects; -- specific drop just in case

-- Re-create strict policies
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'site-assets' );

create policy "Authenticated Upload"
  on storage.objects for insert
  with check ( bucket_id = 'site-assets' and auth.role() = 'authenticated' );

create policy "Authenticated Delete"
  on storage.objects for delete
  using ( bucket_id = 'site-assets' and auth.role() = 'authenticated' );


-- ==========================================
-- 2. TABLE PERMISSIONS (Fixes Content Saving)
-- ==========================================

-- --- TESTIMONIALS ---
alter table public.testimonials enable row level security;
drop policy if exists "Allow auth insert testimonials" on public.testimonials;
drop policy if exists "Allow auth delete testimonials" on public.testimonials;
drop policy if exists "Allow auth update testimonials" on public.testimonials;
drop policy if exists "Allow public read testimonials" on public.testimonials;

create policy "Allow auth insert testimonials" on public.testimonials for insert with check (auth.role() = 'authenticated');
create policy "Allow auth delete testimonials" on public.testimonials for delete using (auth.role() = 'authenticated');
create policy "Allow auth update testimonials" on public.testimonials for update using (auth.role() = 'authenticated');
create policy "Allow public read testimonials" on public.testimonials for select using (true);


-- --- SERVICES ---
alter table public.services enable row level security;
drop policy if exists "Allow auth insert services" on public.services;
drop policy if exists "Allow auth delete services" on public.services;
drop policy if exists "Allow auth update services" on public.services;
drop policy if exists "Allow public read services" on public.services;

create policy "Allow auth insert services" on public.services for insert with check (auth.role() = 'authenticated');
create policy "Allow auth delete services" on public.services for delete using (auth.role() = 'authenticated');
create policy "Allow auth update services" on public.services for update using (auth.role() = 'authenticated');
create policy "Allow public read services" on public.services for select using (true);


-- --- CLIENTS ---
alter table public.clients enable row level security;
drop policy if exists "Allow auth insert clients" on public.clients;
drop policy if exists "Allow auth delete clients" on public.clients;
drop policy if exists "Allow auth update clients" on public.clients;
drop policy if exists "Allow public read clients" on public.clients;

create policy "Allow auth insert clients" on public.clients for insert with check (auth.role() = 'authenticated');
create policy "Allow auth delete clients" on public.clients for delete using (auth.role() = 'authenticated');
create policy "Allow auth update clients" on public.clients for update using (auth.role() = 'authenticated');
create policy "Allow public read clients" on public.clients for select using (true);


-- --- TEAM MEMBERS ---
alter table public.team_members enable row level security;
drop policy if exists "Allow auth insert team" on public.team_members;
drop policy if exists "Allow auth delete team" on public.team_members;
drop policy if exists "Allow auth update team" on public.team_members;
drop policy if exists "Allow public read team" on public.team_members;

create policy "Allow auth insert team" on public.team_members for insert with check (auth.role() = 'authenticated');
create policy "Allow auth delete team" on public.team_members for delete using (auth.role() = 'authenticated');
create policy "Allow auth update team" on public.team_members for update using (auth.role() = 'authenticated');
create policy "Allow public read team" on public.team_members for select using (true);

-- --- CONTACT MESSAGES ---
alter table public.contact_messages enable row level security;
drop policy if exists "Allow public insert messages" on public.contact_messages;
drop policy if exists "Allow auth read messages" on public.contact_messages;
drop policy if exists "Allow auth delete messages" on public.contact_messages;

create policy "Allow public insert messages" on public.contact_messages for insert with check (true);
create policy "Allow auth read messages" on public.contact_messages for select using (auth.role() = 'authenticated');
create policy "Allow auth delete messages" on public.contact_messages for delete using (auth.role() = 'authenticated');
