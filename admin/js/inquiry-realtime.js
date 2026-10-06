// Real-time inquiry notifications for the Admin Panel.
// Source of truth: public.contact_submissions (written by the website contact form).
// Subscribes to INSERT events with Supabase Realtime using the existing client (js/config.js) and the
// signed-in admin session, so the table's RLS applies: only authenticated users receive rows.
// Requires the table in the "supabase_realtime" publication (admin/realtime_setup.sql). Without it,
// a light catch-up check every 30 s keeps the unread badge working.
(function () {
    if (window.__crevaInquiryRealtime) return;          // one instance per page
    window.__crevaInquiryRealtime = true;

    const TABLE = 'contact_submissions';
    const CHANNEL = 'contact-submissions-realtime';
    const LS_UNREAD = 'creva_admin_inquiries_unread';     // ids not yet seen on the Inquiries page
    const LS_NOTIFIED = 'creva_admin_inquiries_notified'; // ids already shown in a notification
    const LS_LAST = 'creva_admin_inquiries_last_seen';    // newest created_at processed
    const POLL_MS = 30000;
    const TOAST_MS = 12000;
    const onInquiriesPage = /\/contacts\.html$/.test(location.pathname);

    const client = window.supabaseClient;
    if (!client || !client.channel) return;

    // ---------- small storage helpers (localStorage may be unavailable)
    const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
    const addId = (k, id, max) => { const a = read(k, []); if (!a.includes(id)) { a.push(id); write(k, a.slice(-max)); } };

    // ---------- UI
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'css/inquiry-realtime.css';
    document.head.appendChild(css);

    let badges = [], statusEl = null, toastBox = null;

    function buildUi() {
        const nav = document.querySelector('.dashboard-nav');
        if (nav) {
            const tools = document.createElement('div');
            tools.className = 'iq-nav-tools';
            statusEl = document.createElement('span');
            statusEl.className = 'iq-rt-status';
            statusEl.setAttribute('role', 'status');
            statusEl.innerHTML = '<span></span>';
            const link = document.createElement('a');
            link.href = 'contacts.html';
            link.className = 'iq-nav-link';
            link.innerHTML = 'Inquiries <span class="iq-badge" hidden></span>';
            if (onInquiriesPage) link.setAttribute('aria-current', 'page');
            tools.append(statusEl, link);
            const logout = nav.querySelector('#logout-btn');
            if (logout) tools.appendChild(logout);              // keep Logout at the far right
            nav.appendChild(tools);
            badges.push(link.querySelector('.iq-badge'));
        }
        // Dashboard "Inquiries" card
        const cardTitle = document.querySelector('a[href="contacts.html"] .dashboard-card h2');
        if (cardTitle) {
            const b = document.createElement('span');
            b.className = 'iq-badge';
            b.hidden = true;
            b.style.marginLeft = '.5rem';
            b.style.verticalAlign = 'middle';
            cardTitle.appendChild(b);
            badges.push(b);
        }
        toastBox = document.createElement('div');
        toastBox.className = 'iq-toasts';
        toastBox.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastBox);
        renderBadge();
    }

    function setStatus(state, text) {
        if (!statusEl) return;
        statusEl.dataset.state = state;
        statusEl.title = text;
        statusEl.firstChild.textContent = text;
    }

    function renderBadge() {
        const n = read(LS_UNREAD, []).length;
        badges.forEach(b => {
            b.hidden = n === 0;
            b.textContent = n > 99 ? '99+' : String(n);
            b.setAttribute('aria-label', n + ' new ' + (n === 1 ? 'inquiry' : 'inquiries'));
        });
    }

    function toast(title, lines, href, inquiryId) {
        if (!toastBox) return;
        while (toastBox.children.length >= 3) toastBox.firstChild.remove();
        const t = document.createElement('div');
        t.className = 'iq-toast';
        t.setAttribute('role', 'status');
        const h = document.createElement('h3');
        h.textContent = '🔔 ' + title;
        t.appendChild(h);
        lines.forEach((l, i) => { const p = document.createElement('p'); p.textContent = l; if (i === 0) p.className = 'iq-toast-name'; t.appendChild(p); });
        const a = document.createElement('a');
        a.className = 'iq-toast-action';
        a.href = href;
        a.textContent = 'View Inquiry';
        if (onInquiriesPage && inquiryId) {
            a.addEventListener('click', (e) => { e.preventDefault(); document.dispatchEvent(new CustomEvent('creva:view-inquiry', { detail: inquiryId })); close(); });
        }
        t.appendChild(a);
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'iq-toast-close';
        x.setAttribute('aria-label', 'Dismiss notification');
        x.textContent = '×';
        x.addEventListener('click', close);
        t.appendChild(x);
        let timer = setTimeout(close, TOAST_MS);
        t.addEventListener('mouseenter', () => clearTimeout(timer));
        t.addEventListener('mouseleave', () => { timer = setTimeout(close, TOAST_MS / 2); });
        function close() { clearTimeout(timer); t.remove(); }
        toastBox.appendChild(t);
    }

    // ---------- unread state
    const viewingInquiries = () => onInquiriesPage && document.visibilityState === 'visible';
    function markAllRead() { write(LS_UNREAD, []); renderBadge(); }

    // ---------- new inquiry handling (deduplicated by id)
    const processed = new Set();

    function handleNew(rows, live) {
        const fresh = rows.filter(r => r && r.id && !processed.has(r.id));
        if (!fresh.length) return;
        fresh.forEach(r => processed.add(r.id));
        const newest = fresh.reduce((m, r) => (r.created_at > m ? r.created_at : m), read(LS_LAST, ''));
        if (newest) write(LS_LAST, newest);

        const notified = read(LS_NOTIFIED, []);
        const toNotify = fresh.filter(r => !notified.includes(r.id));
        fresh.forEach(r => {
            addId(LS_NOTIFIED, r.id, 200);
            if (!viewingInquiries()) addId(LS_UNREAD, r.id, 200);
            document.dispatchEvent(new CustomEvent('creva:inquiry', { detail: r }));
        });
        renderBadge();

        if (live) {   // keep the dashboard "Inquiries" total in step with live inserts
            const stat = document.getElementById('stat-inquiries');
            if (stat && /^\d+$/.test(stat.textContent.trim())) stat.textContent = String(+stat.textContent.trim() + fresh.length);
        }

        if (toNotify.length > 3) {
            toast(toNotify.length + ' New Inquiries', ['New contact inquiries have arrived.'], 'contacts.html');
        } else {
            toNotify.forEach(r => toast('New Inquiry', [r.name || 'New contact inquiry', r.email ? 'Email: ' + r.email : '', r.mobile ? 'Mobile: ' + r.mobile : ''].filter(Boolean),
                'contacts.html?inquiry=' + encodeURIComponent(r.id), r.id));
        }
    }

    // Anything inserted while this page was not subscribed (page changes, reconnects, Realtime off)
    let catchingUp = false;
    async function catchUp() {
        if (catchingUp) return;
        catchingUp = true;
        try {
            const last = read(LS_LAST, '');
            if (!last) {   // first run in this browser: start from the newest existing inquiry, no backlog alerts
                const { data, error } = await client.from(TABLE).select('id,created_at').order('created_at', { ascending: false }).limit(1);
                if (!error) write(LS_LAST, (data && data[0] && data[0].created_at) || new Date().toISOString());
                return;
            }
            const { data, error } = await client.from(TABLE).select('*').gt('created_at', last).order('created_at', { ascending: true }).limit(50);
            if (!error && data && data.length) handleNew(data, false);
        } catch (e) { /* network issue: next attempt will retry */ } finally { catchingUp = false; }
    }

    // ---------- realtime subscription
    let channel = null, pollTimer = null, live = false;

    function startPolling() { if (!pollTimer) pollTimer = setInterval(catchUp, POLL_MS); }
    function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

    function subscribe(session) {
        // never keep two channels for the same table on one page
        (client.getChannels ? client.getChannels() : []).filter(c => c.topic === 'realtime:' + CHANNEL).forEach(c => client.removeChannel(c));
        if (client.realtime && client.realtime.setAuth) { try { client.realtime.setAuth(session.access_token); } catch (e) { /* client sets it automatically */ } }

        channel = client.channel(CHANNEL)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (payload) => handleNew([payload.new], true))
            .on('system', {}, (msg) => {
                if (msg && msg.extension === 'postgres_changes' && msg.status === 'error') {
                    live = false;
                    setStatus('off', 'Realtime not enabled');
                    console.warn('Inquiry realtime unavailable: add contact_submissions to the supabase_realtime publication (admin/realtime_setup.sql).');
                    startPolling();
                } else if (msg && msg.extension === 'postgres_changes' && msg.status === 'ok') {
                    live = true;
                    setStatus('live', 'Live');
                    stopPolling();
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    // "Live" is confirmed by the postgres_changes system "ok" message above
                    catchUp();
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    // supabase-js rejoins the same channel automatically after network errors
                    live = false;
                    setStatus('off', 'Realtime disconnected');
                    startPolling();
                }
            });
    }

    function cleanup() {
        stopPolling();
        if (channel) { client.removeChannel(channel); channel = null; }
    }

    async function init() {
        let session = null;
        try { session = (await client.auth.getSession()).data.session; } catch (e) { /* treated as signed out */ }
        if (!session) return;                                  // auth.js redirects to the login page
        buildUi();
        setStatus('off', 'Connecting…');
        if (onInquiriesPage) {
            if (viewingInquiries()) markAllRead();
            document.addEventListener('visibilitychange', () => { if (viewingInquiries()) markAllRead(); });
        }
        subscribe(session);
        catchUp();
        startPolling();                                        // stopped once Realtime confirms it is live
        window.addEventListener('pagehide', cleanup);
        window.addEventListener('storage', (e) => { if (e.key === LS_UNREAD) renderBadge(); });   // other admin tabs
        client.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') cleanup(); });
    }

    // Lets the Inquiries page show which rows are new for this visit
    window.CrevaInquiryRealtime = { unreadIds: () => read(LS_UNREAD, []) };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
