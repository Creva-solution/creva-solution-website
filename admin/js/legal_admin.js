// Legal pages management (Admin Panel): list page + editor page.
// Security: uses only the public anon key + the signed-in admin session. What an admin may do is enforced by
// Row Level Security in Supabase (see admin/legal_setup.sql) - never by this script alone.

const LEGAL_PAGES = {
    'privacy-policy': { label: 'Privacy Policy', url: '../privacy-policy.html' },
    'terms-and-conditions': { label: 'Terms & Conditions', url: '../terms-and-conditions.html' }
};
const LEGAL_TOOLBAR = ['paragraph', 'bold', 'italic', 'underline', '|', 'ul', 'ol', '|', 'link', '|', 'align', '|', 'undo', 'redo'];

const $ = (id) => document.getElementById(id);
const lgClient = () => window.supabaseClient;

function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Your account is not authorised to change legal pages. Make sure your admin e-mail is added in admin/blog_setup.sql (step 2).';
    if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg)) return 'The legal_pages table was not found. Run admin/legal_setup.sql in the Supabase SQL editor first.';
    return msg || 'Something went wrong. Please try again.';
}
const NOT_SAVED = 'Nothing was saved. Your account is probably not an authorised admin (see admin/blog_setup.sql, step 2) or the page does not exist yet (run admin/legal_setup.sql).';

// Confirms the signed-in user is listed in public.admin_users (SQL function is_admin()).
async function checkLegalAdmin() {
    const warn = $('admin-warning');
    try {
        const { data, error } = await lgClient().rpc('is_admin');
        if (error) throw error;
        if (data === true) return true;
        if (warn) { warn.hidden = false; warn.textContent = 'Your account is signed in but is not an authorised admin, so changes will be rejected. Add your admin e-mail in admin/blog_setup.sql (step 2) and run it in Supabase.'; }
        return false;
    } catch (err) {
        if (warn) { warn.hidden = false; warn.textContent = 'Setup is not complete yet. ' + friendlyError(err); }
        return false;
    }
}

// Persists the visibility flag; resolves with the updated row (RLS blocks silently, so an empty result = not allowed).
async function saveVisibility(slug, visible) {
    const { data, error } = await lgClient().from('legal_pages').update({ is_visible: visible }).eq('slug', slug).select('slug,is_visible,updated_at');
    if (error) throw error;
    if (!data || !data.length) throw new Error(NOT_SAVED);
    return data[0];
}

// ---------------------------------------------------------------- list page
async function initList() {
    const body = $('lg-rows');
    checkLegalAdmin();
    const { data, error } = await lgClient().from('legal_pages').select('slug,title,is_visible,updated_at');
    if (error) { body.innerHTML = '<tr><td colspan="4" class="bl-empty bl-error">' + escHtml(friendlyError(error)) + '</td></tr>'; return; }
    const bySlug = {};
    (data || []).forEach(r => { bySlug[r.slug] = r; });

    body.innerHTML = Object.keys(LEGAL_PAGES).map(slug => {
        const meta = LEGAL_PAGES[slug], r = bySlug[slug];
        if (!r) return '<tr><td data-label="Page"><strong>' + escHtml(meta.label) + '</strong></td><td colspan="3" class="bl-error">Not found in the database. Run admin/legal_setup.sql.</td></tr>';
        return '<tr data-slug="' + slug + '">' +
            '<td data-label="Page"><strong>' + escHtml(r.title) + '</strong><span class="bl-slug">/' + slug + '.html</span></td>' +
            '<td data-label="Status"><span class="lg-status"><label class="lg-switch"><input type="checkbox" class="lg-toggle" ' + (r.is_visible ? 'checked' : '') + ' aria-label="' + escHtml(r.title) + ' visible"><span class="lg-slider"></span></label>' +
            '<span class="lg-status-text ' + (r.is_visible ? 'lg-vis' : 'lg-hid') + '">' + (r.is_visible ? 'Visible' : 'Hidden') + '</span></span></td>' +
            '<td data-label="Updated" class="lg-updated">' + fmtDate(r.updated_at) + '</td>' +
            '<td data-label="Action" class="bl-actions">' +
            '<a class="bl-btn bl-btn-sm" href="legal_editor.html?page=' + slug + '">Edit</a>' +
            '<a class="bl-btn bl-btn-sm" href="' + meta.url + '?preview=1" target="_blank" rel="noopener">Preview</a></td></tr>';
    }).join('');

    body.addEventListener('change', async (e) => {
        const box = e.target.closest('.lg-toggle');
        if (!box) return;
        const row = box.closest('tr'), slug = row.dataset.slug, want = box.checked;
        box.disabled = true;
        try {
            const saved = await saveVisibility(slug, want);
            const txt = row.querySelector('.lg-status-text');
            txt.textContent = saved.is_visible ? 'Visible' : 'Hidden';
            txt.className = 'lg-status-text ' + (saved.is_visible ? 'lg-vis' : 'lg-hid');
            row.querySelector('.lg-updated').textContent = fmtDate(saved.updated_at);
            toast(LEGAL_PAGES[slug].label + (saved.is_visible ? ' is now visible. Its footer link is shown.' : ' is now hidden. Its footer link is removed.'));
        } catch (err) {
            box.checked = !want;
            toast(friendlyError(err), 'err');
        } finally {
            box.disabled = false;
        }
    });
}

// ---------------------------------------------------------------- editor page
async function initEditor() {
    const slug = new URLSearchParams(location.search).get('page');
    const meta = LEGAL_PAGES[slug];
    const errBox = $('editor-error');
    if (!meta) { errBox.hidden = false; errBox.textContent = 'Unknown legal page. Go back to Legal Pages and choose one.'; $('legal-form').hidden = true; return; }

    document.title = 'Edit ' + meta.label + ' - Creva Admin';
    $('editor-title').textContent = 'Edit ' + meta.label;
    $('crumb').textContent = meta.label;
    $('btn-open').href = meta.url + '?preview=1';

    let dirty = false, saving = false, loaded = false;

    const editor = Jodit.make('#f-content', {
        height: 520,
        minHeight: 360,
        toolbarSticky: true,
        toolbarAdaptive: true,
        askBeforePasteHTML: false,
        defaultActionOnPaste: 'insert_clear_html',
        placeholder: 'Write the page content here…',
        showCharsCounter: false,
        showWordsCounter: true,
        showXPathInStatusbar: false,
        controls: {
            paragraph: { list: { p: 'Paragraph', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4' } }
        },
        buttons: LEGAL_TOOLBAR,
        buttonsMD: LEGAL_TOOLBAR,
        buttonsSM: LEGAL_TOOLBAR,
        buttonsXS: LEGAL_TOOLBAR
    });

    const renderMeta = (row) => {
        $('status-meta').textContent = row ? 'Last updated: ' + fmtDate(row.updated_at) : '';
        $('vis-label').textContent = $('f-visible').checked ? 'Visible' : 'Hidden';
    };
    $('f-visible').addEventListener('change', () => { dirty = true; renderMeta(null); $('status-meta').textContent = 'Click Save Changes to apply.'; });
    $('f-title').addEventListener('input', () => { dirty = true; });
    editor.events.on('change', () => { if (loaded) dirty = true; });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

    checkLegalAdmin();
    const { data, error } = await lgClient().from('legal_pages').select('title,content,is_visible,updated_at').eq('slug', slug).maybeSingle();
    if (error || !data) {
        errBox.hidden = false;
        errBox.textContent = error ? friendlyError(error) : 'This page was not found in the database. Run admin/legal_setup.sql in Supabase first.';
        return;
    }
    $('f-title').value = data.title;
    editor.value = data.content || '';
    $('f-visible').checked = !!data.is_visible;
    renderMeta(data);
    loaded = true; dirty = false;

    $('btn-save').addEventListener('click', async () => {
        if (saving || !loaded) return;
        const title = $('f-title').value.trim();
        errBox.hidden = true;
        if (!title) { errBox.hidden = false; errBox.textContent = 'Please enter a page title.'; $('f-title').focus(); return; }
        saving = true; $('btn-save').disabled = true;
        try {
            const { data: rows, error: e } = await lgClient().from('legal_pages')
                .update({ title, content: editor.value, is_visible: $('f-visible').checked })
                .eq('slug', slug).select('updated_at');
            if (e) throw e;
            if (!rows || !rows.length) throw new Error(NOT_SAVED);
            dirty = false;
            renderMeta(rows[0]);
            toast(meta.label + ' saved. The public page now shows the latest content.');
        } catch (err) {
            errBox.hidden = false; errBox.textContent = friendlyError(err);
            toast(friendlyError(err), 'err');
        } finally {
            saving = false; $('btn-save').disabled = false;
        }
    });

    // Preview of the CURRENT (unsaved) editor content, in a sandboxed frame so pasted scripts can never run.
    $('btn-preview').addEventListener('click', () => {
        const css = 'body{font-family:Inter,Arial,sans-serif;color:#4b5563;line-height:1.8;font-size:16px;max-width:46rem;margin:0 auto;padding:1.5rem}' +
            'h1{font-family:Poppins,Arial,sans-serif;color:#0b1a3c}h2{font-family:Poppins,Arial,sans-serif;color:#0b1a3c;font-size:1.5rem;margin:2rem 0 .6rem}' +
            'h3,h4{color:#0b1a3c}a{color:#3C77C3;font-weight:600}ul{list-style:disc;padding-left:1.4rem}ol{list-style:decimal;padding-left:1.4rem}';
        $('lg-frame').srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body><h1>' +
            escHtml($('f-title').value) + '</h1>' + editor.value + '</body></html>';
        $('lg-modal').hidden = false;
    });
    const closeModal = () => { $('lg-modal').hidden = true; };
    $('lg-modal-close').addEventListener('click', closeModal);
    $('lg-modal').addEventListener('click', (e) => { if (e.target === $('lg-modal')) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    $('legal-form').addEventListener('submit', (e) => e.preventDefault());
}

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.legalPage;
    if (!window.supabaseClient) return;
    if (page === 'list') initList();
    if (page === 'editor') initEditor();
});
