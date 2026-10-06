-- ============================================================
-- Mobile Admin App push notifications – device registration
-- Run ONCE in Supabase: SQL Editor -> New query -> Run.  Safe to re-run.
--
-- Requires admin/blog_setup.sql (public.admin_users + public.is_admin()), which already exists in this project.
-- Does NOT change public.contact_submissions, its policies, or the contact form.
--
-- Why a table is needed: FCM device tokens must be stored server-side so the Edge Function
-- "send-admin-push" can reach every authorized admin device. There is no existing device/token system.
-- ============================================================

DO $$
BEGIN
    IF to_regprocedure('public.is_admin()') IS NULL THEN
        RAISE EXCEPTION 'public.is_admin() not found. Run admin/blog_setup.sql first (it creates admin_users + is_admin).';
    END IF;
END $$;

-- 1. Device tokens (one row per installed app; an admin can have several devices)
CREATE TABLE IF NOT EXISTS public.admin_push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    fcm_token text NOT NULL UNIQUE CHECK (char_length(fcm_token) BETWEEN 20 AND 4096),
    platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
    device_name text CHECK (device_name IS NULL OR char_length(device_name) <= 100),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_push_tokens_user ON public.admin_push_tokens (admin_user_id);

-- 2. RLS: admins can see only their own devices; nobody writes directly (only through the functions below).
ALTER TABLE public.admin_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read their own push tokens" ON public.admin_push_tokens;
CREATE POLICY "Admins read their own push tokens"
ON public.admin_push_tokens FOR SELECT TO authenticated
USING (admin_user_id = auth.uid() AND public.is_admin());

REVOKE ALL ON public.admin_push_tokens FROM anon, authenticated;
GRANT SELECT ON public.admin_push_tokens TO authenticated;

-- 3. Register / refresh this device's token for the signed-in admin.
--    ON CONFLICT moves a token to the current admin (same phone, different admin login) and refreshes updated_at.
CREATE OR REPLACE FUNCTION public.register_admin_push_token(p_token text, p_platform text DEFAULT 'android', p_device_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 20 AND 4096 THEN
        RAISE EXCEPTION 'invalid token' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.admin_push_tokens (admin_user_id, fcm_token, platform, device_name)
    VALUES (auth.uid(), p_token, COALESCE(NULLIF(p_platform, ''), 'android'), left(p_device_name, 100))
    ON CONFLICT (fcm_token) DO UPDATE
        SET admin_user_id = EXCLUDED.admin_user_id,
            platform = EXCLUDED.platform,
            device_name = EXCLUDED.device_name,
            updated_at = now();
END;
$$;

-- 4. Remove this device's token on logout (only the caller's own token).
CREATE OR REPLACE FUNCTION public.unregister_admin_push_token(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM public.admin_push_tokens WHERE fcm_token = p_token AND admin_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.register_admin_push_token(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_admin_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_admin_push_token(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_admin_push_token(text) TO authenticated;

-- 5. Recipients for the Edge Function: tokens of users who are STILL admins (removing someone from
--    admin_users stops their pushes immediately). Callable only with the server-side service role.
CREATE OR REPLACE FUNCTION public.get_admin_push_tokens()
RETURNS TABLE (fcm_token text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT t.fcm_token
    FROM public.admin_push_tokens t
    JOIN public.admin_users a ON a.user_id = t.admin_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_admin_push_tokens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_push_tokens() TO service_role;

-- ------------------------------------------------------------
-- Verify (optional)
-- SELECT admin_user_id, platform, device_name, updated_at FROM public.admin_push_tokens;   -- registered devices
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'admin_push_tokens';
-- ------------------------------------------------------------
