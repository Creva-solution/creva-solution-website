-- ====================================================================
-- Creva Solutions – Legal pages management (Supabase setup)
-- Run ONCE in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Safe to re-run: existing legal content is NEVER overwritten.
-- Requires public.is_admin() (created by admin/blog_setup.sql – run that first).
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.legal_pages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    content text NOT NULL DEFAULT '',
    is_visible boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keep updated_at fresh on every change.
CREATE OR REPLACE FUNCTION public.legal_pages_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_pages_touch ON public.legal_pages;
CREATE TRIGGER trg_legal_pages_touch
BEFORE UPDATE ON public.legal_pages
FOR EACH ROW EXECUTE FUNCTION public.legal_pages_touch();

-- --------------------------------------------------------------------
-- Row Level Security
--   Visitors: can read ONLY pages marked visible (hidden content is never exposed). No writes.
--   Authorized admins (public.admin_users): read all, update. No insert/delete from the website.
-- --------------------------------------------------------------------
ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read visible legal pages" ON public.legal_pages;
DROP POLICY IF EXISTS "Admins can read all legal pages" ON public.legal_pages;
DROP POLICY IF EXISTS "Admins can update legal pages" ON public.legal_pages;

CREATE POLICY "Public can read visible legal pages"
ON public.legal_pages FOR SELECT TO anon, authenticated
USING (is_visible = true);

CREATE POLICY "Admins can read all legal pages"
ON public.legal_pages FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can update legal pages"
ON public.legal_pages FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

REVOKE ALL ON public.legal_pages FROM anon, authenticated;
GRANT SELECT ON public.legal_pages TO anon;
GRANT SELECT, UPDATE ON public.legal_pages TO authenticated;

-- --------------------------------------------------------------------
-- Initial pages (existing website content). ON CONFLICT DO NOTHING = never overwrites edits.
-- --------------------------------------------------------------------
INSERT INTO public.legal_pages (slug, title, content, is_visible) VALUES
('privacy-policy', 'Privacy Policy', $lg$<h2>Who we are</h2>
<p>Creva Solutions (&quot;we&quot;, &quot;us&quot;) is an IT and civil services provider based in Sankarapuram, Kallakurichi district, Tamil Nadu, India. This policy explains how we handle information collected through crevasolution.in.</p>
<h2>Information we collect</h2>
<p>When you use our contact form or contact us directly, we collect the details you choose to give us, such as your name, email address, phone number and message.</p>
<p>Our website also loads third-party resources (for example fonts and scripts) that may receive standard technical data such as your IP address and browser type.</p>
<h2>How we use information</h2>
<p>We use the information you send us to respond to your enquiry, prepare quotes, deliver services and improve our website. We do not sell your personal information.</p>
<h2>Storage and sharing</h2>
<p>Enquiries submitted through our website are stored using our service providers. We share information only with providers who help us operate the website and our business, or when required by law.</p>
<h2>Cookies and third-party services</h2>
<p>Our website may use third-party services such as font and script delivery networks and social media links. Those services have their own privacy policies.</p>
<h2>Retention and your choices</h2>
<p>We keep enquiry information for as long as needed to respond and to maintain business records. You may ask us to access, correct or delete the personal information you have given us.</p>
<h2>Contact</h2>
<p>You can reach us at info@crevasolution.in, by phone on +91 86676 22236, or through our <a href="/contact.html">contact page</a>.</p>$lg$, true),
('terms-and-conditions', 'Terms & Conditions', $lg$<h2>Using this website</h2>
<p>By using crevasolution.in you agree to these terms. The content is provided for general information about Creva Solutions and our services.</p>
<h2>Services and quotations</h2>
<p>Descriptions of services on this website are general. The scope, timeline, fees and deliverables for any project are set out in a written quotation or agreement between you and us.</p>
<h2>Intellectual property</h2>
<p>The content, design and logo on this website belong to Creva Solutions unless stated otherwise. Ownership of work delivered to clients is defined in the project agreement.</p>
<h2>Civil and technical drawings</h2>
<p>Drawings, models and designs we prepare support your project. Regulatory approvals and structural certification are governed by local law and are the responsibility of the appropriately licensed professionals and authorities involved.</p>
<h2>Limitation of liability</h2>
<p>We aim to keep website information accurate and current but provide it without warranty. To the extent permitted by law, we are not liable for losses arising from reliance on general website content.</p>
<h2>Changes</h2>
<p>We may update these terms from time to time. The latest version will always be on this page.</p>
<h2>Contact</h2>
<p>You can reach us at info@crevasolution.in, by phone on +91 86676 22236, or through our <a href="/contact.html">contact page</a>.</p>$lg$, true)
ON CONFLICT (slug) DO NOTHING;
