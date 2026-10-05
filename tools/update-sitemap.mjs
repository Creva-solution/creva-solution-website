// Builds the crawlable parts of the blog and the sitemap (static hosting cannot generate these automatically).
// Usage (Node 18+):  node tools/update-sitemap.mjs
// Run it after publishing, editing or unpublishing articles in Admin Panel -> Blog, then commit + push.
//
// What it writes:
//   blog/<slug>.html   a pre-rendered page for every PUBLISHED article (full content, metadata, JSON-LD)
//   js/blog-static.js  the list of pre-rendered slugs (cards and /blog/post.html?slug=... redirect to them)
//   blog.html          static article cards between the BLOG_LIST markers (replaced by the live list in the browser)
//   sitemap.xml        every public page + every published article, canonical URLs only
//
// Articles published after the last run still work at /blog/post.html?slug=<slug> until this is run again.
// Uses the public anon key only (published posts are publicly readable by design).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const SUPABASE_URL = 'https://xtivwelnoccdontbrxft.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0aXZ3ZWxub2NjZG9udGJyeGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDk2NjgsImV4cCI6MjA4NTc4NTY2OH0.zImQM_l1437a62HpO-lAqkWbp0KxOqz9Hg9OmqHgoXU';
const SITE = 'https://crevasolution.in';
const DEFAULT_OG = SITE + '/assets/creva-solutions-og.jpg';
const ROOT = new URL('../', import.meta.url);
const file = (p) => new URL(p, ROOT);
const read = (p) => readFileSync(file(p), 'utf8');

// Public, indexable pages (no admin, no previews, no query strings). Order = sitemap order.
const PAGES = [
    'index.html', 'about.html', 'services.html', 'it-services.html', 'civil-services.html',
    'it-services/web-development.html', 'it-services/digital-marketing.html', 'it-services/ui-ux-design.html',
    'it-services/mobile-app-development.html', 'it-services/software-development.html', 'it-services/branding.html',
    'civil-services/2d-drafting.html', 'civil-services/3d-modeling.html', 'civil-services/planning.html',
    'civil-services/civil-design.html',
    'best-it-company-kallakurichi.html', 'it-company-sankarapuram.html',
    'clients.html', 'blog.html', 'contact.html', 'privacy-policy.html', 'terms-and-conditions.html'
];
const pageUrl = (p) => SITE + '/' + (p === 'index.html' ? '' : p);

// ---------- 1. published posts
const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?select=*&published=eq.true&order=published_at.desc`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
});
if (!res.ok) { console.error('Could not read blog posts:', res.status, await res.text()); process.exit(1); }
const posts = (await res.json()).filter(p => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug || ''));
const slugs = posts.map(p => p.slug);

// ---------- 2. shared browser helpers (same card markup, categories and service links as the live pages)
const ctx = { window: { BLOG_STATIC_SLUGS: slugs } };
vm.createContext(ctx);
vm.runInContext(read('js/blog-common.js'), ctx);
const { blogEsc: esc, blogCat, BLOG_SERVICES, blogCardHtml, blogFmtDate, blogSafeUrl, blogOrgRef } = ctx;

// ---------- helpers
const plain = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const jsonLd = (obj) => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';
const absUrl = (u) => (u && u.startsWith('/') ? SITE + u : u);

// Article HTML is written by signed-in admins only (RLS), but strip anything executable anyway,
// mirroring the DOMPurify step on the live page.
function sanitize(html) {
    return String(html || '')
        .replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<(script|style|iframe|object|embed|form|meta|link|base)\b[^>]*>/gi, '')
        .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(href|src)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, '')
        .replace(/<a\b([^>]*\btarget=["']_blank["'][^>]*)>/gi, (m, a) => '<a' + a.replace(/\srel=("[^"]*"|'[^']*')/i, '') + ' rel="noopener noreferrer">')
        .replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"')
        .replace(/<table\b[\s\S]*?<\/table>/gi, (t) => '<div class="article-table">' + t + '</div>');
}

// FAQ: a heading "FAQ" / "Frequently Asked Questions", then H3/H4 = question, following blocks = answer.
function extractFaq(html) {
    const head = /<h[23][^>]*>\s*(faqs?|frequently asked questions)\b[\s\S]*?<\/h[23]>/i.exec(html);
    if (!head) return [];
    let rest = html.slice(head.index + head[0].length);
    const stop = rest.search(/<h[12][\s>]/i);
    if (stop !== -1) rest = rest.slice(0, stop);
    return rest.split(/<h[34][^>]*>/i).slice(1).map(part => {
        const [q, a] = part.split(/<\/h[34]>/i);
        return { q: plain(q), a: plain(a) };
    }).filter(f => f.q && f.a);
}

function gitDate(p) {
    try {
        const git = (args) => execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        if (git(['status', '--porcelain', '--', p])) return new Date().toISOString().slice(0, 10);
        const d = git(['log', '-1', '--format=%cs', '--', p]);
        return d || new Date().toISOString().slice(0, 10);
    } catch { return new Date().toISOString().slice(0, 10); }
}

// ---------- 3. article pages, built from the blog/post.html shell (same nav, footer and styles)
const shell = read('blog/post.html');
if (!/<div id="post-root">[\s\S]*?<\/div>\s*<\/main>/.test(shell) || !shell.includes('<!-- Schema -->')) {
    console.error('blog/post.html no longer has the expected structure (post-root / Schema marker).'); process.exit(1);
}

function articlePage(post) {
    const url = SITE + '/blog/' + post.slug + '.html';
    const content = sanitize(post.content);
    const text = plain(content);
    const words = text ? text.split(' ').length : 0;
    const readMin = Math.max(1, Math.round(words / 200));
    const cat = blogCat(post.category);
    const services = cat.services.map(k => BLOG_SERVICES[k]).filter(Boolean);
    const img = blogSafeUrl(post.featured_image);
    const ogImage = img ? absUrl(img) : DEFAULT_OG;
    const title = (post.seo_title || '').trim() || post.title + ' | Creva Solutions';
    const desc = ((post.seo_description || '').trim() || (post.excerpt || '').trim() || text.slice(0, 155)).replace(/\s+/g, ' ');
    const author = (post.author || 'Creva Solutions').trim();
    const orgAuthor = /creva/i.test(author);
    const published = post.published_at || post.created_at;
    const modified = post.updated_at || published;
    const faqs = extractFaq(content);

    const meta = `<title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${url}">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Creva Solutions">
    <meta property="og:locale" content="en_IN">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:image" content="${esc(ogImage)}">
    ${published ? `<meta property="article:published_time" content="${esc(published)}">` : ''}
    ${modified ? `<meta property="article:modified_time" content="${esc(modified)}">` : ''}
    ${post.category ? `<meta property="article:section" content="${esc(post.category)}">` : ''}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${esc(ogImage)}">

    `;

    const schema = [
        jsonLd({
            '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': url + '#article',
            headline: post.title, description: desc, url, mainEntityOfPage: url, image: [ogImage],
            datePublished: published, dateModified: modified, articleSection: post.category || undefined,
            wordCount: words, inLanguage: 'en-IN',
            author: orgAuthor ? blogOrgRef() : { '@type': 'Person', name: author },
            publisher: blogOrgRef(),
            isPartOf: { '@type': 'Blog', '@id': SITE + '/blog.html#blog', name: 'Creva Solutions Blog' },
            about: services.map(s => ({ '@type': 'Service', name: s.name, url: SITE + s.url }))
        }),
        jsonLd({
            '@context': 'https://schema.org', '@type': 'BreadcrumbList',
            itemListElement: [['Home', SITE + '/'], ['Blog', SITE + '/blog.html'], [post.title, url]]
                .map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: c[1] }))
        }),
        faqs.length ? jsonLd({
            '@context': 'https://schema.org', '@type': 'FAQPage',
            mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
        }) : ''
    ].filter(Boolean).join('\n    ');

    const others = posts.filter(p => p.slug !== post.slug);
    const related = [...others.filter(p => post.category && p.category === post.category),
        ...others.filter(p => !post.category || p.category !== post.category)].slice(0, 3);

    const serviceCards = services.map(s =>
        '<a href="' + s.url + '" class="svc-card' + (s.civil ? ' svc-tone-civil' : '') + '" style="display:block"><span class="svc-icon"><i data-lucide="' + s.icon + '" class="w-6 h-6"></i></span><h3>' + esc(s.name) + '</h3><p>' + esc(s.text) + '</p><span class="inline-flex items-center text-primary font-semibold mt-3 text-sm">Learn More <i data-lucide="chevron-right" class="w-4 h-4 ml-1"></i></span></a>').join('');

    const body = `<div id="post-root">
        <section class="bg-primary text-white py-16 md:py-20 relative overflow-hidden">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 max-w-4xl">
                <nav aria-label="Breadcrumb" class="breadcrumb breadcrumb-left mb-6"><ol>
                    <li><a href="/index.html">Home</a></li><li><a href="/blog.html">Blog</a></li><li aria-current="page">${esc(post.category || post.title)}</li>
                </ol></nav>
                ${post.category ? '<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-semibold">' + esc(post.category) + '</span>' : ''}
                <h1 class="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 mb-4">${esc(post.title)}</h1>
                <p class="text-blue-100 text-sm">${published ? '<time datetime="' + esc(published) + '">' + esc(blogFmtDate(published)) + '</time> • ' : ''}${readMin} min read • By ${esc(author)}</p>
            </div>
        </section>

        <article class="py-12 md:py-16 bg-white">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                ${img ? '<figure class="article-figure"><img src="' + esc(img) + '" alt="' + esc(post.title) + '" decoding="async"></figure>' : ''}
                ${post.excerpt ? '<div class="article-body"><p class="article-lead">' + esc(post.excerpt) + '</p></div>' : ''}
                <div class="article-body" id="article-content">${content}</div>
            </div>
        </article>

        <section class="svc-section svc-soft" aria-labelledby="rs-heading">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="svc-head"><span class="svc-label">Our Services</span><h2 id="rs-heading">Related Services</h2><p>How Creva Solutions can help with what you just read, for clients in Sankarapuram, Kallakurichi and nearby areas.</p></div>
                <div class="svc-grid svc-grid-3">${serviceCards}</div>
            </div>
        </section>
${related.length ? `
        <section class="svc-section svc-white" id="related-articles" aria-labelledby="ra-heading">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="svc-head"><span class="svc-label">Keep Reading</span><h2 id="ra-heading">Related Articles</h2></div>
                <div class="grid md:grid-cols-3 gap-8" id="related-grid">${related.map(blogCardHtml).join('')}</div>
            </div>
        </section>
` : ''}
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
        </section>
        </div>
    </main>`;

    return shell
        .replace(/<title>[\s\S]*?(?=<link rel="icon")/, meta)
        .replace(/<!-- Schema -->[^\n]*\n\s*\n?/, '<!-- Schema -->\n    ' + schema + '\n\n')
        .replace(/<div id="post-root">[\s\S]*?<\/div>\s*<\/main>/, body)
        .replace(/^.*(supabase-js@2|dompurify|supabase-public\.js|blog-static\.js|blog-common\.js|blog-post\.js).*\r?\n/gm, '');
}

// A page for an article that was unpublished since the last build: keep the URL from serving stale content.
const goneStub = (slug) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Article no longer available | Creva Solutions</title>
    <meta name="robots" content="noindex, follow">
    <meta http-equiv="refresh" content="0; url=/blog.html">
</head>
<body><p>This article is no longer available. <a href="/blog.html">Browse all articles</a>.</p></body>
</html>
`;

let previous = [];
try { previous = JSON.parse((/BLOG_STATIC_SLUGS\s*=\s*(\[[\s\S]*?\])/.exec(read('js/blog-static.js')) || [])[1] || '[]'); } catch { /* first run */ }

for (const post of posts) writeFileSync(file('blog/' + post.slug + '.html'), articlePage(post));
const removed = previous.filter(s => !slugs.includes(s));
for (const s of removed) if (existsSync(file('blog/' + s + '.html'))) writeFileSync(file('blog/' + s + '.html'), goneStub(s));

writeFileSync(file('js/blog-static.js'),
    '// Generated by tools/update-sitemap.mjs - do not edit by hand.\n' +
    '// Published articles that have a pre-rendered page at /blog/<slug>.html.\n' +
    'window.BLOG_STATIC_SLUGS = ' + JSON.stringify(slugs, null, 4) + ';\n');

// ---------- 4. blog.html: crawlable article cards (the browser swaps in the live list)
let blogHtml = read('blog.html');
const cards = posts.map(blogCardHtml).join('\n');
blogHtml = blogHtml.replace(/<!-- BLOG_LIST:START -->[\s\S]*?<!-- BLOG_LIST:END -->/,
    '<!-- BLOG_LIST:START -->\n' + cards + '\n<!-- BLOG_LIST:END -->');
writeFileSync(file('blog.html'), blogHtml);

// ---------- 5. service pages: "Helpful guides" from articles whose category relates to that service
const SERVICE_PAGES = PAGES.filter(p => /^(it|civil)-services\//.test(p));
for (const p of SERVICE_PAGES) {
    let h = read(p);
    h = h.replace(/<!-- RELATED_ARTICLES:START ([a-z0-9-]+) -->[\s\S]*?<!-- RELATED_ARTICLES:END -->/, (m, key) => {
        const picks = [...posts.filter(x => blogCat(x.category).services[0] === key),
            ...posts.filter(x => blogCat(x.category).services[0] !== key && blogCat(x.category).services.includes(key))].slice(0, 3);
        const list = picks.length ? '<div class="svc-reading"><h3>Helpful guides from our blog</h3><ul>' + picks.map(x =>
            '<li><a href="' + ctx.blogUrl(x.slug) + '">' + esc(x.title) + '</a>' + (x.excerpt ? '<p>' + esc(x.excerpt) + '</p>' : '') + '</li>').join('') + '</ul></div>' : '';
        return `<!-- RELATED_ARTICLES:START ${key} -->${list}<!-- RELATED_ARTICLES:END -->`;
    });
    writeFileSync(file(p), h);
}

// ---------- 6. sitemap.xml
const entries = [
    ...PAGES.filter(p => existsSync(file(p))).map(p => ({ loc: pageUrl(p), lastmod: gitDate(p) })),
    ...posts.map(p => ({ loc: SITE + '/blog/' + p.slug + '.html', lastmod: (p.updated_at || p.published_at || new Date().toISOString()).slice(0, 10) }))
];
writeFileSync(file('sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(e => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`).join('\n') + '\n</urlset>\n');

console.log(`Built ${posts.length} article page(s)${removed.length ? `, retired ${removed.length}` : ''}; sitemap.xml has ${entries.length} URLs.`);
