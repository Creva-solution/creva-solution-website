-- One-time update: rename "Creva Solutions" to "Creva Solution" in content stored in Supabase,
-- so it matches the website and the Google Business Profile.
-- Run once in Supabase -> SQL Editor, then run `node tools/update-sitemap.mjs` and push.
-- Safe to run more than once (later runs change nothing).

UPDATE public.blog_posts SET
    title           = replace(title, 'Creva Solutions', 'Creva Solution'),
    excerpt         = replace(excerpt, 'Creva Solutions', 'Creva Solution'),
    content         = replace(content, 'Creva Solutions', 'Creva Solution'),
    author          = replace(author, 'Creva Solutions', 'Creva Solution'),
    seo_title       = replace(seo_title, 'Creva Solutions', 'Creva Solution'),
    seo_description = replace(seo_description, 'Creva Solutions', 'Creva Solution')
WHERE title LIKE '%Creva Solutions%'
   OR excerpt LIKE '%Creva Solutions%'
   OR content LIKE '%Creva Solutions%'
   OR author LIKE '%Creva Solutions%'
   OR seo_title LIKE '%Creva Solutions%'
   OR seo_description LIKE '%Creva Solutions%';

UPDATE public.legal_pages SET
    title   = replace(title, 'Creva Solutions', 'Creva Solution'),
    content = replace(content, 'Creva Solutions', 'Creva Solution')
WHERE title LIKE '%Creva Solutions%' OR content LIKE '%Creva Solutions%';
