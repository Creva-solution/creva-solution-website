// Blog management (Admin Panel): list page + editor page.
// Security: uses only the public anon key + the signed-in admin session. What an admin may do is enforced by
// Row Level Security in Supabase (see admin/blog_setup.sql) - never by this script alone.

const BLOG_BUCKET = 'blog-images';
const BLOG_CATEGORIES = ['Web Development', 'UI/UX Design', 'Mobile App Development', 'Software Development', 'Digital Marketing', 'Branding', 'Civil Design', '2D Drafting', '3D Modeling', 'Technology', 'Business'];
const BLOG_SERVICE_LINKS = [
    ['IT Services', '/it-services.html'],
    ['Web Development', '/it-services/web-development.html'],
    ['Mobile App Development', '/it-services/mobile-app-development.html'],
    ['UI/UX Design', '/it-services/ui-ux-design.html'],
    ['Software Development', '/it-services/software-development.html'],
    ['Digital Marketing', '/it-services/digital-marketing.html'],
    ['Branding', '/it-services/branding.html'],
    ['Civil Services', '/civil-services.html'],
    ['2D Drafting', '/civil-services/2d-drafting.html'],
    ['3D Modeling', '/civil-services/3d-modeling.html'],
    ['Planning / Architectural Services', '/civil-services/planning.html'],
    ['Civil Design Services', '/civil-services/civil-design.html'],
    ['Contact / Get a Quote', '/contact.html']
];
const BLOG_SITE = 'https://crevasolution.in';
const BLOG_TOOLBAR = ['paragraph', 'bold', 'italic', 'underline', '|', 'ul', 'ol', '|', 'link', 'uploadImage', 'table', '|', 'align', '|', 'undo', 'redo', '|', 'source', 'fullsize'];

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);
const blogClient = () => window.supabaseClient;

function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90)
        .replace(/-+$/, '');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toast(msg, type) {
    const t = $('bl-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'bl-toast ' + (type === 'err' ? 'bl-toast-err' : 'bl-toast-ok');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 4500);
}

function friendlyError(err) {
    const code = err && err.code;
    const msg = (err && err.message) || '';
    if (code === '23505' || /duplicate key|unique/i.test(msg)) return 'That slug is already used by another post. Please choose a different slug.';
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Your account is not authorised to manage blog posts. Add your admin e-mail in admin/blog_setup.sql (step 2) and run it in Supabase.';
    if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg)) return 'The blog table was not found. Run admin/blog_setup.sql in the Supabase SQL editor first.';
    return msg || 'Something went wrong. Please try again.';
}

// Confirms the signed-in user is listed in public.admin_users (SQL function is_admin()).
async function checkBlogAdmin() {
    const warn = $('admin-warning');
    try {
        const { data, error } = await blogClient().rpc('is_admin');
        if (error) throw error;
        if (data === true) return true;
        if (warn) {
            warn.hidden = false;
            warn.textContent = 'Your account is signed in but is not an authorised blog admin, so saving and publishing will be rejected. Add your admin e-mail in admin/blog_setup.sql (step 2) and run it in Supabase.';
        }
        return false;
    } catch (err) {
        if (warn) {
            warn.hidden = false;
            warn.textContent = 'Blog setup is not complete yet. ' + friendlyError(err);
        }
        return false;
    }
}

// Resize + convert to WebP in the browser so images stay small (GIF/SVG are uploaded unchanged).
async function optimizeImage(file, maxWidth) {
    if (file.size > 12 * 1024 * 1024) throw new Error('Image is too large (max 12 MB).');
    if (/gif|svg/i.test(file.type)) return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bmp.width);
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.82));
    if (!blob) return file;
    return new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
}

async function uploadBlogImage(file, folder, maxWidth) {
    const optimized = await optimizeImage(file, maxWidth);
    const ext = (optimized.name.split('.').pop() || 'webp').toLowerCase();
    const path = folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await blogClient().storage.from(BLOG_BUCKET).upload(path, optimized, { contentType: optimized.type, cacheControl: '31536000', upsert: false });
    if (error) throw error;
    return blogClient().storage.from(BLOG_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Storage path of an image that lives in our blog-images bucket (null for anything else).
function blogImagePath(url) {
    if (!url) return null;
    const marker = '/' + BLOG_BUCKET + '/';
    const i = url.indexOf(marker);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

async function removeBlogImage(url) {
    const path = blogImagePath(url);
    if (!path) return;
    const { error } = await blogClient().storage.from(BLOG_BUCKET).remove([path]);
    if (error) console.warn('Could not remove old image', error.message);
}

const previewUrl = (slug) => '../blog/post.html?slug=' + encodeURIComponent(slug) + '&preview=1';

// ================================================================ LIST PAGE
function initList() {
    let posts = [];
    const rows = $('bl-rows');

    function renderStats() {
        $('stat-total').textContent = posts.length;
        $('stat-published').textContent = posts.filter(p => p.published).length;
        $('stat-drafts').textContent = posts.filter(p => !p.published).length;
    }

    function render() {
        const q = $('bl-search').value.trim().toLowerCase();
        const st = $('bl-status').value;
        const list = posts.filter(p =>
            (st === 'all' || (st === 'published') === !!p.published) &&
            (!q || (p.title || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)));
        if (!list.length) {
            rows.innerHTML = '<tr><td colspan="7" class="bl-empty">' + (posts.length ? 'No posts match your filters.' : 'No blog posts yet. Click “+ Create New Blog” to write your first article.') + '</td></tr>';
            return;
        }
        rows.innerHTML = list.map(p => `
            <tr data-id="${p.id}">
                <td data-label="Image">${p.featured_image ? `<img class="bl-thumb" src="${escHtml(p.featured_image)}" alt="" loading="lazy">` : '<span class="bl-thumb bl-thumb-empty">No image</span>'}</td>
                <td data-label="Title"><a class="bl-title-link" href="blog_editor.html?id=${p.id}">${escHtml(p.title)}</a><small class="bl-slug">${escHtml(p.slug)}</small></td>
                <td data-label="Category">${escHtml(p.category || '—')}</td>
                <td data-label="Author">${escHtml(p.author || '—')}</td>
                <td data-label="Status"><span class="bl-badge ${p.published ? 'bl-badge-pub' : 'bl-badge-draft'}">${p.published ? 'Published' : 'Draft'}</span></td>
                <td data-label="Published">${fmtDate(p.published_at)}</td>
                <td data-label="Actions" class="bl-actions">
                    <a class="bl-btn bl-btn-sm" href="blog_editor.html?id=${p.id}">Edit</a>
                    <a class="bl-btn bl-btn-sm" href="${previewUrl(p.slug)}" target="_blank" rel="noopener">Preview</a>
                    <button type="button" class="bl-btn bl-btn-sm" data-act="toggle">${p.published ? 'Unpublish' : 'Publish'}</button>
                    <button type="button" class="bl-btn bl-btn-sm bl-btn-danger" data-act="delete">Delete</button>
                </td>
            </tr>`).join('');
    }

    async function load() {
        const { data, error } = await blogClient()
            .from('blog_posts')
            .select('id,title,slug,category,author,published,published_at,featured_image,created_at')
            .order('created_at', { ascending: false });
        if (error) {
            rows.innerHTML = '<tr><td colspan="7" class="bl-empty bl-error">' + escHtml(friendlyError(error)) + '</td></tr>';
            return;
        }
        posts = data || [];
        renderStats();
        render();
    }

    rows.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.closest('tr').dataset.id;
        const post = posts.find(p => p.id === id);
        if (!post) return;

        if (btn.dataset.act === 'toggle') {
            btn.disabled = true;
            const publishing = !post.published;
            const patch = { published: publishing, published_at: publishing ? new Date().toISOString() : null };
            const { error } = await blogClient().from('blog_posts').update(patch).eq('id', id);
            if (error) { toast(friendlyError(error), 'err'); btn.disabled = false; return; }
            Object.assign(post, patch);
            toast(publishing ? 'Post published.' : 'Post unpublished (now a draft).');
            renderStats(); render();
        }

        if (btn.dataset.act === 'delete') {
            if (!confirm('Are you sure you want to delete this blog post?')) return;
            btn.disabled = true;
            const { error } = await blogClient().from('blog_posts').delete().eq('id', id);
            if (error) { toast(friendlyError(error), 'err'); btn.disabled = false; return; }
            await removeBlogImage(post.featured_image);
            posts = posts.filter(p => p.id !== id);
            toast('Blog post deleted.');
            renderStats(); render();
        }
    });

    $('bl-search').addEventListener('input', render);
    $('bl-status').addEventListener('change', render);
    checkBlogAdmin();
    load();
}

// ================================================================ EDITOR PAGE
function initEditor() {
    const params = new URLSearchParams(location.search);
    const editId = params.get('id');
    let post = null;                 // row being edited (null = new)
    let pendingFile = null;          // newly chosen featured image (uploaded on save)
    let imageUrl = null;             // current featured image url
    let originalImageUrl = null;     // url stored in DB when the editor opened
    let slugTouched = false;
    let dirty = false;
    let saving = false;

    // Category dropdown + service link helper
    $('f-category').insertAdjacentHTML('beforeend', BLOG_CATEGORIES.map(c => `<option>${escHtml(c)}</option>`).join(''));
    $('link-service').insertAdjacentHTML('beforeend', BLOG_SERVICE_LINKS.map(([n, u]) => `<option value="${u}">${escHtml(n)}</option>`).join(''));

    // Custom toolbar button: uploads the picture to Supabase Storage and inserts it (no base64 images in the database).
    Jodit.defaultOptions.controls.uploadImage = { icon: 'image', tooltip: 'Insert image', exec: (ed) => pickContentImage(ed) };

    // Rich text editor (Jodit): no HTML knowledge needed.
    const editor = Jodit.make('#f-content', {
        height: 520,
        minHeight: 360,
        toolbarSticky: true,
        toolbarAdaptive: true,
        askBeforePasteHTML: false,
        defaultActionOnPaste: 'insert_clear_html',
        placeholder: 'Write your article here…',
        showCharsCounter: false,
        showWordsCounter: true,
        showXPathInStatusbar: false,
        uploader: { insertImageAsBase64URI: false },
        controls: {
            paragraph: {
                list: { p: 'Paragraph', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', blockquote: 'Quote' }
            }
        },
        buttons: BLOG_TOOLBAR,
        buttonsMD: BLOG_TOOLBAR,
        buttonsSM: BLOG_TOOLBAR,
        buttonsXS: BLOG_TOOLBAR
    });

    function pickContentImage(ed) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/gif';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            try {
                toast('Uploading image…');
                const url = await uploadBlogImage(file, 'content', 1400);
                const alt = window.prompt('Describe the image (alt text, helps SEO and accessibility):', '') || '';
                ed.s.insertHTML('<img src="' + escHtml(url) + '" alt="' + escHtml(alt) + '" loading="lazy">');
                toast('Image inserted.');
            } catch (err) {
                toast(friendlyError(err), 'err');
            }
        };
        input.click();
    }

    // ---- slug
    const updateSlugUrl = () => { $('slug-url').textContent = '/blog/post.html?slug=' + ($('f-slug').value || '…'); };
    $('f-title').addEventListener('input', () => {
        if (!slugTouched) $('f-slug').value = slugify($('f-title').value);
        updateSlugUrl(); updateSeoPreview(); markDirty();
    });
    $('f-slug').addEventListener('input', () => { slugTouched = true; updateSlugUrl(); updateSeoPreview(); markDirty(); });
    $('f-slug').addEventListener('blur', () => { $('f-slug').value = slugify($('f-slug').value); updateSlugUrl(); });
    $('slug-regen').addEventListener('click', () => { $('f-slug').value = slugify($('f-title').value); slugTouched = false; updateSlugUrl(); updateSeoPreview(); markDirty(); });

    // ---- counters + SEO preview
    function updateSeoPreview() {
        const title = $('f-seo-title').value.trim() || $('f-title').value.trim() || 'Title';
        const desc = $('f-seo-desc').value.trim() || $('f-excerpt').value.trim() || 'Description';
        $('serp-title').textContent = title;
        $('serp-desc').textContent = desc;
        $('serp-url').textContent = 'crevasolution.in › blog › ' + ($('f-slug').value || 'slug');
        $('excerpt-count').textContent = $('f-excerpt').value.length + '/300';
        $('seo-title-count').textContent = $('f-seo-title').value.length + '/60 recommended';
        $('seo-desc-count').textContent = $('f-seo-desc').value.length + '/160 recommended';
    }
    ['f-excerpt', 'f-seo-title', 'f-seo-desc', 'f-category', 'f-author'].forEach(id => $(id).addEventListener('input', () => { updateSeoPreview(); markDirty(); }));
    editor.events.on('change', markDirty);

    function markDirty() { dirty = true; }
    window.addEventListener('beforeunload', (e) => { if (dirty && !saving) { e.preventDefault(); e.returnValue = ''; } });

    // ---- helpers inside the editor
    $('link-service').addEventListener('change', (e) => {
        const url = e.target.value;
        if (!url) return;
        const label = e.target.options[e.target.selectedIndex].text;
        const selected = editor.s.isCollapsed() ? '' : editor.s.html;
        editor.s.insertHTML('<a href="' + url + '">' + (selected || escHtml(label)) + '</a>');
        e.target.value = '';
        markDirty();
    });
    $('insert-faq').addEventListener('click', () => {
        editor.s.insertHTML('<h2>Frequently Asked Questions</h2><h3>Write the question here?</h3><p>Write a short, direct answer here.</p>');
        markDirty();
    });

    // ---- featured image
    function renderImage() {
        const box = $('img-preview');
        const src = pendingFile ? URL.createObjectURL(pendingFile) : imageUrl;
        box.innerHTML = src ? '<img src="' + escHtml(src) + '" alt="Featured image preview">' : '<span>No image selected</span>';
        $('img-remove').hidden = !src;
        $('img-choose').textContent = src ? 'Replace image' : 'Upload image';
    }
    $('img-choose').addEventListener('click', () => $('f-image').click());
    $('f-image').addEventListener('change', () => {
        const f = $('f-image').files[0];
        if (!f) return;
        if (!/^image\//.test(f.type)) { toast('Please choose an image file.', 'err'); return; }
        if (f.size > 12 * 1024 * 1024) { toast('Image is too large (max 12 MB).', 'err'); return; }
        pendingFile = f; renderImage(); markDirty();
    });
    $('img-remove').addEventListener('click', () => { pendingFile = null; imageUrl = null; $('f-image').value = ''; renderImage(); markDirty(); });

    // ---- status UI
    function renderStatus() {
        const badge = $('status-badge');
        const published = post && post.published;
        badge.textContent = !post ? 'New' : published ? 'Published' : 'Draft';
        badge.className = 'bl-badge ' + (published ? 'bl-badge-pub' : 'bl-badge-draft');
        $('status-meta').textContent = post ? (published ? 'Published ' + fmtDate(post.published_at) + '. ' : '') + 'Last updated ' + fmtDate(post.updated_at) + '.' : 'Not saved yet.';
        $('btn-publish').textContent = published ? 'Update (keep published)' : 'Publish';
        $('btn-draft').textContent = published ? 'Unpublish & save as draft' : 'Save Draft';
        const pv = $('btn-preview');
        pv.hidden = !post;
        if (post) pv.href = previewUrl(post.slug);
        $('crumb').textContent = post ? post.title : 'New';
        $('editor-title').textContent = post ? 'Edit Blog' : 'Create New Blog';
    }

    function showError(msg) {
        const el = $('editor-error');
        el.textContent = msg; el.hidden = !msg;
        if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ---- load existing
    async function loadPost() {
        const { data, error } = await blogClient().from('blog_posts').select('*').eq('id', editId).maybeSingle();
        if (error || !data) { showError(error ? friendlyError(error) : 'That blog post was not found.'); return; }
        post = data;
        slugTouched = true; // never rewrite the URL of an existing post automatically
        $('f-title').value = data.title || '';
        $('f-slug').value = data.slug || '';
        $('f-excerpt').value = data.excerpt || '';
        editor.value = data.content || '';
        $('f-category').value = data.category || '';
        if (data.category && $('f-category').value !== data.category) {
            $('f-category').insertAdjacentHTML('beforeend', '<option>' + escHtml(data.category) + '</option>');
            $('f-category').value = data.category;
        }
        $('f-author').value = data.author || '';
        $('f-seo-title').value = data.seo_title || '';
        $('f-seo-desc').value = data.seo_description || '';
        imageUrl = originalImageUrl = data.featured_image || null;
        renderImage(); renderStatus(); updateSlugUrl(); updateSeoPreview();
        dirty = false;
    }

    // ---- save
    async function save(publish) {
        if (saving) return;
        showError('');
        const title = $('f-title').value.trim();
        let slug = slugify($('f-slug').value || title);
        const content = editor.value.trim();
        const textLen = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length;

        if (!title) return showError('Please enter a title.');
        if (!slug) return showError('Please enter a slug (letters, numbers and hyphens).');
        if (!textLen && !/<img/i.test(content)) return showError('Please write the article content.');
        if (/src\s*=\s*["']data:/i.test(content)) return showError('The content contains an embedded (pasted) image. Please remove it and add the picture with the image button instead, so it is stored safely.');
        $('f-slug').value = slug;

        saving = true;
        const buttons = [$('btn-publish'), $('btn-draft')];
        buttons.forEach(b => { b.disabled = true; });
        const label = publish ? $('btn-publish') : $('btn-draft');
        const prevLabel = label.textContent;
        label.textContent = 'Saving…';

        try {
            // unique slug check (also enforced by the database)
            let q = blogClient().from('blog_posts').select('id').eq('slug', slug);
            if (post) q = q.neq('id', post.id);
            const { data: clash, error: clashErr } = await q.limit(1);
            if (clashErr) throw clashErr;
            if (clash && clash.length) throw { message: 'That slug is already used by another post. Please choose a different slug.' };

            // featured image
            let newImageUrl = imageUrl;
            let uploadedNew = false;
            if (pendingFile) {
                newImageUrl = await uploadBlogImage(pendingFile, 'posts', 1600);
                uploadedNew = true;
            }

            const nowIso = new Date().toISOString();
            const wasPublished = !!(post && post.published);
            const payload = {
                title, slug,
                excerpt: $('f-excerpt').value.trim() || null,
                content,
                featured_image: newImageUrl || null,
                category: $('f-category').value || null,
                author: $('f-author').value.trim() || null,
                seo_title: $('f-seo-title').value.trim() || null,
                seo_description: $('f-seo-desc').value.trim() || null,
                published: publish,
                published_at: publish ? (wasPublished && post.published_at ? post.published_at : nowIso) : null,
                updated_at: nowIso
            };

            let res;
            if (post) res = await blogClient().from('blog_posts').update(payload).eq('id', post.id).select().single();
            else res = await blogClient().from('blog_posts').insert([payload]).select().single();
            if (res.error) {
                if (uploadedNew) await removeBlogImage(newImageUrl); // don't leave an orphan upload
                throw res.error;
            }

            // replaced / removed image: delete the old file now that the row points elsewhere
            if (originalImageUrl && originalImageUrl !== newImageUrl) await removeBlogImage(originalImageUrl);

            post = res.data;
            slugTouched = true; // a saved post keeps its URL when the title is edited later
            imageUrl = originalImageUrl = post.featured_image || null;
            pendingFile = null; $('f-image').value = '';
            dirty = false;
            if (!editId) history.replaceState(null, '', 'blog_editor.html?id=' + post.id);
            renderImage(); renderStatus();
            toast(publish ? 'Published. The article is now live on the Blog page.' : 'Draft saved.');
        } catch (err) {
            showError(friendlyError(err));
        } finally {
            saving = false;
            buttons.forEach(b => { b.disabled = false; });
            label.textContent = prevLabel;
            renderStatus();
        }
    }

    $('btn-publish').addEventListener('click', () => save(true));
    $('btn-draft').addEventListener('click', () => save(false));
    $('blog-form').addEventListener('submit', (e) => e.preventDefault());

    renderStatus(); updateSlugUrl(); updateSeoPreview(); renderImage();
    checkBlogAdmin();
    if (editId) loadPost();
}

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.blogPage;
    if (!window.supabaseClient) return;
    if (page === 'list') initList();
    if (page === 'editor') initEditor();
});
