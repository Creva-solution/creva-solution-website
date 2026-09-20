// Public Blog article page: /blog/post.html?slug=<slug>
// Loads one published post from Supabase, renders it safely, and sets SEO metadata (title, description,
// canonical, Open Graph, Article / Breadcrumb / FAQ structured data) for that article.
document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('post-root');
    if (!root) return;
    const client = window.supabaseClient;
    const params = new URLSearchParams(location.search);
    const slug = (params.get('slug') || '').trim().toLowerCase();
    const wantPreview = params.get('preview') === '1';

    // ---------- small DOM helpers
    const head = document.head;
    function setMeta(attr, key, value) {
        let el = head.querySelector('meta[' + attr + '="' + key + '"]');
        if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); head.appendChild(el); }
        el.setAttribute('content', value);
    }
    function setCanonical(url) {
        let el = head.querySelector('link[rel="canonical"]');
        if (!el) { el = document.createElement('link'); el.rel = 'canonical'; head.appendChild(el); }
        el.href = url;
    }
    function addJsonLd(id, obj) {
        let el = document.getElementById(id);
        if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = id; head.appendChild(el); }
        el.textContent = JSON.stringify(obj);
    }
    const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

    // ---------- not found
    function notFound(message) {
        document.title = 'Article not found | Creva Solutions';
        setMeta('name', 'robots', 'noindex, follow');
        setMeta('name', 'description', 'This article could not be found.');
        root.innerHTML = `
            <section class="svc-section svc-white" style="min-height:50vh;display:flex;align-items:center">
                <div class="container mx-auto px-4 sm:px-6 lg:px-8 text-center" style="max-width:38rem">
                    <span class="svc-label">Error 404</span>
                    <h1 class="text-3xl md:text-4xl font-bold font-heading text-dark mb-4">Article not found</h1>
                    <p class="text-gray-600 mb-8">${blogEsc(message || 'The article you are looking for does not exist or is no longer available.')}</p>
                    <div class="flex flex-col sm:flex-row justify-center gap-3">
                        <a href="/blog.html" class="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold bg-primary text-white">Browse all articles</a>
                        <a href="/index.html" class="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold border-2 border-primary text-primary">Back to home</a>
                    </div>
                </div>
            </section>`;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return notFound();
    if (!client) return notFound('Articles could not be loaded right now. Please try again later.');

    // ---------- fetch (drafts are visible only to signed-in admins in preview mode; RLS enforces this)
    let post = null;
    try {
        let q = client.from('blog_posts').select('*').eq('slug', slug);
        if (!wantPreview) q = q.eq('published', true);
        const { data, error } = await q.maybeSingle();
        if (error) throw error;
        post = data;
    } catch (err) {
        console.warn('Blog article load failed', err && err.code ? err.code : '');
        return notFound('Articles could not be loaded right now. Please try again later.');
    }
    if (!post || (!post.published && !wantPreview)) return notFound();

    // ---------- content: sanitise, then post-process
    const clean = window.DOMPurify
        ? DOMPurify.sanitize(post.content || '', { USE_PROFILES: { html: true }, ADD_ATTR: ['target', 'loading'] })
        : blogEsc(post.content || '');
    const box = document.createElement('div');
    box.innerHTML = clean;
    box.querySelectorAll('a[target="_blank"]').forEach(a => { a.rel = 'noopener noreferrer'; });
    box.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; img.decoding = 'async'; });
    box.querySelectorAll('table').forEach(t => { const w = document.createElement('div'); w.className = 'article-table'; t.parentNode.insertBefore(w, t); w.appendChild(t); });

    // FAQ detection: a heading like "FAQ" / "Frequently Asked Questions", then H3/H4 = question, following blocks = answer.
    const faqs = [];
    const faqHead = [...box.querySelectorAll('h2,h3')].find(h => /^\s*(faqs?|frequently asked questions)\b/i.test(h.textContent));
    if (faqHead) {
        let node = faqHead.nextElementSibling, cur = null;
        while (node) {
            if (/^H[12]$/.test(node.tagName)) break;
            if (/^H[34]$/.test(node.tagName)) { cur = { q: node.textContent.trim(), a: [] }; faqs.push(cur); }
            else if (cur) cur.a.push(node.textContent.trim());
            node = node.nextElementSibling;
        }
    }
    const faqList = faqs.map(f => ({ q: f.q, a: f.a.join(' ').trim() })).filter(f => f.q && f.a);

    const text = plain(clean);
    const words = text ? text.split(' ').length : 0;
    const readMin = Math.max(1, Math.round(words / 200));
    const cat = blogCat(post.category);
    const catServices = cat.services.map(k => BLOG_SERVICES[k]).filter(Boolean);
    const imgUrl = blogSafeUrl(post.featured_image);
    const pageUrl = BLOG_SITE + '/blog/post.html?slug=' + encodeURIComponent(post.slug);
    const seoTitle = (post.seo_title || '').trim() || post.title;
    const seoDesc = (post.seo_description || '').trim() || (post.excerpt || '').trim() || text.slice(0, 155);
    const ogImage = imgUrl ? (imgUrl.startsWith('/') ? BLOG_SITE + imgUrl : imgUrl) : BLOG_SITE + '/assets/creva-logo.svg';
    const authorName = (post.author || 'Creva Solutions').trim();
    const isOrgAuthor = /creva/i.test(authorName);

    // ---------- SEO metadata
    document.title = seoTitle;
    setMeta('name', 'description', seoDesc);
    setMeta('name', 'robots', wantPreview && !post.published ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    setCanonical(pageUrl);
    setMeta('property', 'og:type', 'article');
    setMeta('property', 'og:site_name', 'Creva Solutions');
    setMeta('property', 'og:url', pageUrl);
    setMeta('property', 'og:title', seoTitle);
    setMeta('property', 'og:description', seoDesc);
    setMeta('property', 'og:image', ogImage);
    if (post.published_at) setMeta('property', 'article:published_time', post.published_at);
    if (post.category) setMeta('property', 'article:section', post.category);
    setMeta('name', 'twitter:card', imgUrl ? 'summary_large_image' : 'summary');
    setMeta('name', 'twitter:title', seoTitle);
    setMeta('name', 'twitter:description', seoDesc);
    setMeta('name', 'twitter:image', ogImage);

    addJsonLd('ld-article', {
        '@context': 'https://schema.org', '@type': 'BlogPosting',
        headline: post.title, description: seoDesc, url: pageUrl, mainEntityOfPage: pageUrl,
        image: [ogImage], datePublished: post.published_at || post.created_at, dateModified: post.updated_at || post.published_at || post.created_at,
        articleSection: post.category || undefined, wordCount: words,
        author: { '@type': isOrgAuthor ? 'Organization' : 'Person', name: authorName },
        publisher: { '@type': 'Organization', name: 'Creva Solutions', logo: { '@type': 'ImageObject', url: BLOG_SITE + '/assets/creva-logo.svg' } }
    });
    addJsonLd('ld-breadcrumb', {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [['Home', BLOG_SITE + '/'], ['Blog', BLOG_SITE + '/blog.html'], [post.title, pageUrl]].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: c[1] }))
    });
    if (faqList.length) {
        addJsonLd('ld-faq', {
            '@context': 'https://schema.org', '@type': 'FAQPage',
            mainEntity: faqList.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
        });
    }

    // ---------- render
    const previewBanner = wantPreview && !post.published
        ? '<div class="bg-yellow-50 text-yellow-800 text-center text-sm py-2 px-4 border-b border-yellow-200" style="background:#fffbeb;color:#92400e;border-bottom:1px solid #fde68a">Preview only – this article is a draft and is not visible to the public.</div>' : '';

    const serviceCards = catServices.map(s =>
        '<a href="' + s.url + '" class="svc-card' + (s.civil ? ' svc-tone-civil' : '') + '" style="display:block"><span class="svc-icon"><i data-lucide="' + s.icon + '" class="w-6 h-6"></i></span><h3>' + blogEsc(s.name) + '</h3><p>' + blogEsc(s.text) + '</p><span class="inline-flex items-center text-primary font-semibold mt-3 text-sm">Learn More <i data-lucide="chevron-right" class="w-4 h-4 ml-1"></i></span></a>').join('');

    root.innerHTML = previewBanner + `
        <section class="bg-primary text-white py-16 md:py-20 relative overflow-hidden">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 max-w-4xl">
                <nav aria-label="Breadcrumb" class="breadcrumb breadcrumb-left mb-6"><ol>
                    <li><a href="/index.html">Home</a></li><li><a href="/blog.html">Blog</a></li>${post.category ? '<li aria-current="page">' + blogEsc(post.category) + '</li>' : ''}
                </ol></nav>
                ${post.category ? '<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-semibold">' + blogEsc(post.category) + '</span>' : ''}
                <h1 class="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 mb-4">${blogEsc(post.title)}</h1>
                <p class="text-blue-100 text-sm">${post.published_at ? '<time datetime="' + blogEsc(post.published_at) + '">' + blogEsc(blogFmtDate(post.published_at)) + '</time> • ' : ''}${readMin} min read • By ${blogEsc(authorName)}</p>
            </div>
        </section>

        <article class="py-12 md:py-16 bg-white">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                ${imgUrl ? '<figure class="article-figure"><img src="' + blogEsc(imgUrl) + '" alt="' + blogEsc(post.title) + '" decoding="async"></figure>' : ''}
                ${post.excerpt ? '<div class="article-body"><p class="article-lead">' + blogEsc(post.excerpt) + '</p></div>' : ''}
                <div class="article-body" id="article-content"></div>
            </div>
        </article>

        <section class="svc-section svc-soft" aria-labelledby="rs-heading">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="svc-head"><span class="svc-label">Our Services</span><h2 id="rs-heading">Related Services</h2><p>How Creva Solutions can help with what you just read.</p></div>
                <div class="svc-grid svc-grid-3">${serviceCards}</div>
            </div>
        </section>

        <section class="svc-section svc-white" id="related-articles" aria-labelledby="ra-heading" hidden>
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="svc-head"><span class="svc-label">Keep Reading</span><h2 id="ra-heading">Related Articles</h2></div>
                <div class="grid md:grid-cols-3 gap-8" id="related-grid"></div>
            </div>
        </section>

        <section class="svc-cta">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="svc-cta-inner">
                    <h2>Have a Project in Mind?</h2>
                    <p>Tell us what you need and Creva Solutions will help you plan the right solution.</p>
                    <div class="svc-cta-buttons">
                        <a href="/contact.html" class="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold bg-white text-primary border-2 border-primary hover:bg-primary hover:text-white transition-all">Get a Free Quote</a>
                        <a href="/blog.html" class="svc-btn-ghost">More Articles</a>
                    </div>
                </div>
            </div>
        </section>`;
    document.getElementById('article-content').appendChild(box);
    blogRefreshIcons();

    // ---------- related articles: same category first, then newest
    try {
        const { data } = await client.from('blog_posts')
            .select('id,title,slug,excerpt,featured_image,category,published_at')
            .eq('published', true).neq('id', post.id)
            .order('published_at', { ascending: false }).limit(30);
        const others = data || [];
        const picks = [...others.filter(p => post.category && p.category === post.category), ...others.filter(p => !post.category || p.category !== post.category)].slice(0, 3);
        if (picks.length) {
            document.getElementById('related-grid').innerHTML = picks.map(blogCardHtml).join('');
            document.getElementById('related-articles').hidden = false;
            blogRefreshIcons();
        }
    } catch (err) { /* related articles are optional */ }
});
