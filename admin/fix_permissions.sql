-- FIX PERMISSIONS SCRIPT
-- Run this in your Supabase SQL Editor to ensure public pages can read the data.

-- 1. Grant usage on the public schema to generic roles
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- 2. Grant SELECT permission on all relevant tables to 'anon' (Public) and 'authenticated' (Admin)
GRANT SELECT ON public.clients TO anon, authenticated;
GRANT SELECT ON public.services TO anon, authenticated;
GRANT SELECT ON public.team_members TO anon, authenticated;
GRANT SELECT ON public.testimonials TO anon, authenticated;
GRANT SELECT ON public.contact_messages TO anon, authenticated;

-- 3. Ensure INSERT permissions are correct for Contact Form (anon needs to insert messages)
GRANT INSERT ON public.contact_messages TO anon;

-- 4. Disable RLS (Row Level Security) on these tables to prevent policy errors
-- This effectively makes the tables public-readable (and admin-writable via client-side logic + auth check)
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.services DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials DISABLE ROW LEVEL SECURITY;
-- Keep RLS enabled for contact_messages if needed, but for now disable to solve "row-level security policy" error on insert
ALTER TABLE public.contact_messages DISABLE ROW LEVEL SECURITY;

-- 5. Helper to verify
SELECT * FROM public.clients LIMIT 1;
