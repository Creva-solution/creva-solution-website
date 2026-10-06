-- ============================================================
-- Realtime for Admin Panel inquiry notifications
-- Run this ONCE in the Supabase dashboard: SQL Editor -> New query -> Run
--
-- Adds public.contact_submissions to the "supabase_realtime" publication so the Admin Panel
-- (admin/js/inquiry-realtime.js) receives INSERT events instantly.
-- It does NOT change the table, RLS or policies: Realtime still applies the existing RLS, so only
-- signed-in (authenticated) users receive rows; anonymous visitors receive nothing.
-- (Dashboard alternative: Database -> Publications -> supabase_realtime -> enable contact_submissions,
--  or Table Editor -> contact_submissions -> "Enable Realtime".)
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contact_submissions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_submissions;
    END IF;
END $$;

-- ------------------------------------------------------------
-- Verify (optional): expect one row for contact_submissions
-- SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- ------------------------------------------------------------
