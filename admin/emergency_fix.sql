-- EMERGENCY FIX: ALLOW PUBLIC INSERT
-- Run this to verify if the issue is Authentication-related.

-- 1. Testimonials: Allow ANYONE to insert (Bypass Auth Check)
alter table public.testimonials enable row level security;

-- Drop strict policy
drop policy if exists "Allow auth insert testimonials" on public.testimonials;

-- Create permissive policy
create policy "Allow public insert testimonials" 
on public.testimonials 
for insert 
with check (true);

-- 2. Ensure Select is also public (should already be, but ensuring)
drop policy if exists "Allow public read testimonials" on public.testimonials;
create policy "Allow public read testimonials" on public.testimonials for select using (true);
