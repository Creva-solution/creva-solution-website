-- ============================================================
-- Contact form submissions (crevasolution.in/contact.html)
-- Run this ONCE in the Supabase dashboard: SQL Editor -> New query -> Run
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.contact_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    name text NOT NULL,
    email text NOT NULL,
    mobile text NOT NULL,
    service text NOT NULL,
    message text NOT NULL
);

-- 2. Row Level Security
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- 3. Public (anonymous) visitors may ONLY insert new submissions
DROP POLICY IF EXISTS "Allow public contact form submissions" ON public.contact_submissions;
CREATE POLICY "Allow public contact form submissions"
ON public.contact_submissions
FOR INSERT
TO anon
WITH CHECK (true);

-- 4. Only signed-in (authenticated / admin) users may read submissions.
--    There is deliberately NO select, update or delete policy for anon.
DROP POLICY IF EXISTS "Allow authenticated read of contact submissions" ON public.contact_submissions;
CREATE POLICY "Allow authenticated read of contact submissions"
ON public.contact_submissions
FOR SELECT
TO authenticated
USING (true);

-- 5. Table privileges (RLS still applies on top of these)
REVOKE ALL ON public.contact_submissions FROM anon;
GRANT INSERT ON public.contact_submissions TO anon;
GRANT SELECT ON public.contact_submissions TO authenticated;

-- ------------------------------------------------------------
-- Verify (optional): expect one INSERT policy for anon and one SELECT policy for authenticated
-- SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'contact_submissions';
-- ------------------------------------------------------------
