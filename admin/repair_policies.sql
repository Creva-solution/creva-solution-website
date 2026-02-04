-- REPAIR RLS POLICIES (UPDATED)
-- Run this script in Supabase SQL Editor.
-- It fixes both DATABASE TABLE permissions and STORAGE permissions.

-- 1. FIX STORAGE PERMISSIONS (Crucial for Image Uploads)
-- Drop existing policies to avoid conflicts
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated Upload" on storage.objects;
drop policy if exists "Authenticated Delete" on storage.objects;

-- Re-create policies
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'site-assets' );

create policy "Authenticated Upload"
  on storage.objects for insert
  with check ( bucket_id = 'site-assets' and auth.role() = 'authenticated' );

create policy "Authenticated Delete"
  on storage.objects for delete
  using ( bucket_id = 'site-assets' and auth.role() = 'authenticated' );


-- 2. RESET TESTIMONIALS POLICIES
alter table public.testimonials enable row level security;

drop policy if exists "Allow auth insert testimonials" on public.testimonials;
create policy "Allow auth insert testimonials" on public.testimonials for insert with check (auth.role() = 'authenticated');

drop policy if exists "Allow auth delete testimonials" on public.testimonials;
create policy "Allow auth delete testimonials" on public.testimonials for delete using (auth.role() = 'authenticated');

drop policy if exists "Allow auth update testimonials" on public.testimonials;
create policy "Allow auth update testimonials" on public.testimonials for update using (auth.role() = 'authenticated');

drop policy if exists "Allow public read testimonials" on public.testimonials;
create policy "Allow public read testimonials" on public.testimonials for select using (true);


-- 3. RESET SERVICES POLICIES
alter table public.services enable row level security;

drop policy if exists "Allow auth insert services" on public.services;
create policy "Allow auth insert services" on public.services for insert with check (auth.role() = 'authenticated');

drop policy if exists "Allow auth delete services" on public.services;
create policy "Allow auth delete services" on public.services for delete using (auth.role() = 'authenticated');

drop policy if exists "Allow public read services" on public.services;
create policy "Allow public read services" on public.services for select using (true);


-- 4. RESET CLIENTS POLICIES
alter table public.clients enable row level security;

drop policy if exists "Allow auth insert clients" on public.clients;
create policy "Allow auth insert clients" on public.clients for insert with check (auth.role() = 'authenticated');

drop policy if exists "Allow auth delete clients" on public.clients;
create policy "Allow auth delete clients" on public.clients for delete using (auth.role() = 'authenticated');

drop policy if exists "Allow public read clients" on public.clients;
create policy "Allow public read clients" on public.clients for select using (true);


-- 5. RESET TEAM POLICIES
alter table public.team_members enable row level security;

drop policy if exists "Allow auth insert team" on public.team_members;
create policy "Allow auth insert team" on public.team_members for insert with check (auth.role() = 'authenticated');

drop policy if exists "Allow auth delete team" on public.team_members;
create policy "Allow auth delete team" on public.team_members for delete using (auth.role() = 'authenticated');

drop policy if exists "Allow public read team" on public.team_members;
create policy "Allow public read team" on public.team_members for select using (true);
