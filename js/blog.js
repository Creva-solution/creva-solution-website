// Public Blog page: loads published posts from Supabase (public.blog_posts), newest first.
document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('blog-grid');
    if (!grid) return;
    const status = document.getElementById('blog-status');
    const filters = document.getElementById('blog-filters');
    const client = window.supabaseClient;

    const setStatus = (html) => { if (status) { status.innerHTML = html; status.hidden = !html; } };
    grid.innerHTML = Array(3).fill('<div class="rounded-xl border border-gray-100 overflow-hidden"><div class="h-48 skeleton"></div><div class="p-6"><div class="h-4 w-1/3 skeleton mb-3"></div><div class="h-6 w-full skeleton mb-3"></div><div class="h-4 w-5/6 skeleton"></div></div></div>').join('');

    if (!client) { grid.innerHTML = ''; setStatus('Articles could not be loaded right now. Please try again later.'); return; }

    let posts = [];
    try {
        const { data, error } = await client
            .from('blog_posts')
            .select('id,title,slug,excerpt,featured_image,category,published_at')
            .eq('published', true)
            .order('published_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        posts = data || [];
    } catch (err) {
        console.warn('Blog load failed', err && err.code ? err.code : '');
        grid.innerHTML = '';
        setStatus('Articles could not be loaded right now. Please try again later.');
        return;
    }

    if (!posts.length) {
        grid.innerHTML = '';
        setStatus('New articles are coming soon. In the meantime, <a href="services.html" class="text-primary font-semibold hover:underline">explore our services</a> or <a href="contact.html" class="text-primary font-semibold hover:underline">contact us</a>.');
        return;
    }

    function render(cat) {
        const list = cat === 'all' ? posts : posts.filter(p => p.category === cat);
        grid.innerHTML = list.map((p, i) => blogCardHtml(p, i)).join('');
        setStatus(list.length ? '' : 'No articles in this category yet.');
        blogRefreshIcons();
    }

    // Category filter (only categories that actually have published posts)
    const cats = [...new Set(posts.map(p => p.category).filter(Boolean))];
    if (filters && cats.length > 1) {
        filters.hidden = false;
        filters.innerHTML = ['all', ...cats].map((c, i) => '<button type="button" class="pf-filter' + (i === 0 ? ' is-active' : '') + '" data-cat="' + blogEsc(c) + '" aria-pressed="' + (i === 0) + '">' + (c === 'all' ? 'All' : blogEsc(c)) + '</button>').join('');
        filters.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-cat]');
            if (!b) return;
            filters.querySelectorAll('button').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
            render(b.dataset.cat);
        });
    }
    render('all');
});
