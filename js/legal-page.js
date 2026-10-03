// Public legal pages (Privacy Policy, Terms & Conditions): content, title and visibility come from Supabase (public.legal_pages).
// Row Level Security only returns VISIBLE pages to visitors, so hidden content is never sent to the browser.
// An admin can open <page>?preview=1 while signed in to the Admin Panel to review a page (even a hidden one).
(function () {
    var slug = document.body.getAttribute('data-legal-slug');
    var root = document.getElementById('legal-content');
    var h1 = document.getElementById('legal-title');
    var updated = document.getElementById('legal-updated');
    if (!slug || !root) return;

    var preview = /[?&]preview=1(&|$)/.test(location.search);
    var BRAND = 'Creva Solution';

    function setMeta(sel, attr, val) {
        var el = document.querySelector(sel);
        if (el) el.setAttribute(attr, val);
    }
    function setRobots(v) { setMeta('meta[name="robots"]', 'content', v); }
    function setTitle(t) {
        document.title = t;
        setMeta('meta[property="og:title"]', 'content', t);
        setMeta('meta[name="twitter:title"]', 'content', t);
    }

    function unavailable() {
        setTitle('Page Not Available | ' + BRAND);
        setRobots('noindex, nofollow');
        if (h1) h1.textContent = 'Page Not Available';
        if (updated) updated.textContent = '';
        root.innerHTML = '<div style="text-align:center;padding:1rem 0 2rem">' +
            '<p style="font-size:1.1rem;margin-bottom:1.5rem">This page is currently unavailable.</p>' +
            '<a href="index.html" class="text-primary font-semibold hover:underline">Back to Home</a>' +
            ' &nbsp;&middot;&nbsp; <a href="contact.html" class="text-primary font-semibold hover:underline">Contact us</a></div>';
    }

    function fail() {
        setRobots('noindex, follow');
        if (updated) updated.textContent = '';
        root.innerHTML = '<p style="text-align:center">We could not load this page right now. Please refresh, or <a href="contact.html">contact us</a>.</p>';
    }

    function render(row) {
        var hidden = row.is_visible === false;
        if (hidden && !preview) { unavailable(); return; }

        setTitle(row.title + ' | ' + BRAND);
        if (h1) h1.textContent = row.title;
        if (updated && row.updated_at) {
            updated.textContent = 'Last updated: ' + new Date(row.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        // Hidden pages (admin preview only) and previews are never indexed.
        setRobots(hidden || preview ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');

        var html = row.content || '';
        if (window.DOMPurify) {
            html = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
        } else {
            html = '';   // never inject unsanitised HTML
        }
        root.innerHTML = html || '<p>This page has no content yet.</p>';
        root.querySelectorAll('a[target="_blank"]').forEach(function (a) { a.rel = 'noopener noreferrer'; });

        if (preview) {
            var bar = document.createElement('p');
            bar.style.cssText = 'background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:.6rem 1rem;border-radius:.5rem;margin-bottom:1.5rem;font-size:.9rem';
            bar.textContent = hidden ? 'Admin preview – this page is currently HIDDEN from visitors.' : 'Admin preview.';
            root.insertBefore(bar, root.firstChild);
        }
    }

    var client = window.supabaseClient;
    if (!client) { fail(); return; }
    client.from('legal_pages').select('title,content,is_visible,updated_at').eq('slug', slug).maybeSingle()
        .then(function (res) {
            if (res.error) { fail(); return; }
            if (!res.data) { unavailable(); return; }
            render(res.data);
        })
        .catch(fail);
})();
