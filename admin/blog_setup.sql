-- ====================================================================
-- Creva Solutions – Blog management system (Supabase setup)
-- Run this ONCE in the Supabase dashboard: SQL Editor -> New query -> Run
-- Safe to re-run: every statement is idempotent.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. ADMIN AUTHORIZATION
--    Only users listed in public.admin_users may manage blog posts.
--    (A normal "authenticated" login is NOT enough.)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    email text,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- A signed-in user can see only their own row (nobody can edit this table from the website).
DROP POLICY IF EXISTS "Users can read their own admin row" ON public.admin_users;
CREATE POLICY "Users can read their own admin row"
ON public.admin_users FOR SELECT TO authenticated
USING (user_id = auth.uid());

REVOKE ALL ON public.admin_users FROM anon, authenticated;
GRANT SELECT ON public.admin_users TO authenticated;

-- Helper used by every blog policy. SECURITY DEFINER so it can read admin_users reliably.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- >>> IMPORTANT – STEP 2: make YOUR admin login an authorized admin. <<<
-- Replace the e-mail below with the e-mail you use to sign in to the Admin Panel, then run.
-- (Add more admins later with the same statement.)
INSERT INTO public.admin_users (user_id, email)
SELECT id, email FROM auth.users
WHERE email = 'REPLACE-WITH-YOUR-ADMIN-EMAIL@example.com'
ON CONFLICT (user_id) DO NOTHING;

-- --------------------------------------------------------------------
-- 2. BLOG TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    slug text NOT NULL UNIQUE,
    excerpt text,
    content text NOT NULL,
    featured_image text,
    category text,
    author text DEFAULT 'Creva Solution',
    seo_title text,
    seo_description text,
    published boolean NOT NULL DEFAULT false,
    published_at timestamptz
);

-- Indexes (slug already has a unique index from the UNIQUE constraint; the explicit one keeps it obvious)
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON public.blog_posts (category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON public.blog_posts (published);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON public.blog_posts (published_at DESC);

-- Keep updated_at fresh and make sure a published post always has a published_at date.
CREATE OR REPLACE FUNCTION public.blog_posts_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    IF NEW.published AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blog_posts_before_write ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_before_write
BEFORE INSERT OR UPDATE ON public.blog_posts
FOR EACH ROW EXECUTE FUNCTION public.blog_posts_before_write();

-- --------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- --------------------------------------------------------------------
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can read all posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can insert posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can update posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can delete posts" ON public.blog_posts;

-- Anonymous visitors: read PUBLISHED posts only. No insert / update / delete.
CREATE POLICY "Public can read published posts"
ON public.blog_posts FOR SELECT TO anon, authenticated
USING (published = true);

-- Authorized admins: everything (including drafts).
CREATE POLICY "Admins can read all posts"
ON public.blog_posts FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert posts"
ON public.blog_posts FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update posts"
ON public.blog_posts FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete posts"
ON public.blog_posts FOR DELETE TO authenticated
USING (public.is_admin());

REVOKE ALL ON public.blog_posts FROM anon, authenticated;
GRANT SELECT ON public.blog_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;

-- --------------------------------------------------------------------
-- 4. STORAGE BUCKET FOR BLOG IMAGES
--    Public read (images are shown on the website); only admins can upload/replace/delete.
-- --------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Blog images are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload blog images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update blog images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete blog images" ON storage.objects;

CREATE POLICY "Blog images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-images');

CREATE POLICY "Admins can upload blog images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'blog-images' AND public.is_admin());

CREATE POLICY "Admins can update blog images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'blog-images' AND public.is_admin())
WITH CHECK (bucket_id = 'blog-images' AND public.is_admin());

CREATE POLICY "Admins can delete blog images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'blog-images' AND public.is_admin());

-- --------------------------------------------------------------------
-- Verify (optional):
--   SELECT public.is_admin();                                   -- run while signed in via the app: true for admins
--   SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'blog_posts';
-- --------------------------------------------------------------------
