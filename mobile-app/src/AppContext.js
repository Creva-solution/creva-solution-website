// App state: auth + admin check, inquiries from public.contact_submissions, live updates, unread, push.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase, withTimeout, friendlyError, isNetworkError } from './supabase';
import { store } from './store';
import { TABLE } from './config';
import * as push from './push';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);
const byNewest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

export function AppProvider({ children, onOpenInquiry }) {
    const [booting, setBooting] = useState(true);
    const [session, setSession] = useState(null);
    const [admin, setAdmin] = useState({ ok: false, unverified: false, error: '' });
    const [data, setData] = useState({ inquiries: [], loaded: false, error: '', fromCache: false, total: null });
    const [seen, setSeen] = useState({ lastViewedAt: null, readIds: new Set(), highlight: new Set() });
    const [online, setOnline] = useState(true);
    const [realtime, setRealtime] = useState('off');        // off | connecting | live | unavailable
    const [pushInfo, setPushInfo] = useState({ state: 'unavailable', status: '', message: '' });
    const [needsPushIntro, setNeedsPushIntro] = useState(false);
    const [banner, setBanner] = useState(null);             // { id, name }
    const announced = useRef(new Set());
    const knownIds = useRef(new Set());                 // synchronous de-duplication by inquiry id
    const channel = useRef(null);
    const sessionRef = useRef(null);
    sessionRef.current = session;

    // ---------- inquiries
    const upsert = useCallback((row) => {
        if (!row || !row.id) return false;
        const added = !knownIds.current.has(row.id);
        knownIds.current.add(row.id);
        setData((d) => {
            const i = d.inquiries.findIndex((r) => r.id === row.id);
            if (i >= 0) { const list = d.inquiries.slice(); list[i] = { ...list[i], ...row }; return { ...d, inquiries: list }; }
            return { ...d, inquiries: [row, ...d.inquiries].sort(byNewest), total: d.total == null ? null : d.total + 1 };
        });
        return added;
    }, []);

    const announce = useCallback((row) => {
        if (!row || !row.id || announced.current.has(row.id)) return;
        announced.current.add(row.id);
        setBanner({ id: row.id, name: row.name || 'a website visitor' });
    }, []);

    const load = useCallback(async () => {
        try {
            const [list, count] = await withTimeout(Promise.all([
                supabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(200),
                supabase.from(TABLE).select('id', { count: 'exact', head: true })
            ]));
            if (list.error) throw list.error;
            const rows = list.data || [];
            rows.forEach((r) => knownIds.current.add(r.id));
            setData((d) => {
                const live = d.fromCache ? [] : d.inquiries.filter((r) => !rows.some((x) => x.id === r.id));
                const merged = [...live, ...rows].sort(byNewest);
                store.setCachedInquiries(merged);
                return { inquiries: merged, loaded: true, error: '', fromCache: false, total: count.error ? rows.length : count.count };
            });
            // first run on this device: everything already in the table counts as seen (server time, not phone clock)
            setSeen((s) => {
                if (s.lastViewedAt) return s;
                const v = (rows[0] && rows[0].created_at) || '1970-01-01T00:00:00Z';
                store.setLastViewedAt(v);
                return { ...s, lastViewedAt: v };
            });
        } catch (err) {
            const msg = friendlyError(err);
            const cached = await store.cachedInquiries();
            setData((d) => (d.inquiries.length ? { ...d, loaded: true, error: msg }
                : { inquiries: cached, loaded: true, error: msg, fromCache: cached.length > 0, total: null }));
        }
    }, []);

    const fetchOne = useCallback(async (id) => {
        try {
            const { data: row, error } = await withTimeout(supabase.from(TABLE).select('*').eq('id', id).maybeSingle());
            if (error) throw error;
            if (row) upsert(row);
            return { row };
        } catch (err) {
            const local = data.inquiries.find((r) => r.id === id);
            return local ? { row: local, offline: true } : { error: friendlyError(err) };
        }
    }, [data.inquiries, upsert]);

    // ---------- realtime while the app is open (requires admin/realtime_setup.sql)
    const stopRealtime = useCallback(() => {
        if (channel.current) { supabase.removeChannel(channel.current); channel.current = null; }
        setRealtime('off');
    }, []);
    const startRealtime = useCallback(() => {
        if (channel.current) supabase.removeChannel(channel.current);
        setRealtime('connecting');
        channel.current = supabase.channel('contact-submissions-mobile')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (payload) => {
                if (upsert(payload.new)) announce(payload.new);
            })
            .on('system', {}, (msg) => {
                if (msg && msg.extension === 'postgres_changes') setRealtime(msg.status === 'ok' ? 'live' : 'unavailable');
            })
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtime('off');
            });
    }, [upsert, announce]);

    // ---------- push
    const refreshPush = useCallback(async () => {
        const state = await push.permissionState();
        setPushInfo((p) => ({ ...p, state }));
        if (state === 'granted') {
            try { await push.registerDevice(); setPushInfo({ state, status: 'registered', message: '' }); }
            catch (e) { setPushInfo({ state, status: 'error', message: friendlyError(e) }); }
        }
        return state;
    }, []);

    const enablePush = useCallback(async () => {
        let state;
        try {
            state = await push.requestPermissionAndRegister();
            setPushInfo({ state, status: state === 'granted' ? 'registered' : '', message: '' });
        } catch (e) {
            state = 'granted';
            setPushInfo({ state, status: 'error', message: friendlyError(e) });
        }
        await store.setPushIntroShown();
        setNeedsPushIntro(false);
        return state;
    }, []);
    const skipPushIntro = useCallback(async () => { await store.setPushIntroShown(); setNeedsPushIntro(false); }, []);

    // ---------- auth + admin check
    const afterSignIn = useCallback(async (s) => {
        const uid = s && s.user && s.user.id;
        let next = { ok: false, unverified: false, error: '' };
        try {
            const { data: isAdmin, error } = await withTimeout(supabase.rpc('is_admin'));
            if (error) throw error;
            next.ok = isAdmin === true;
            if (!next.ok) next.error = 'This account is signed in but is not listed as a Creva Solutions admin (public.admin_users).';
            else await store.setAdminFor(uid);
        } catch (err) {
            const msg = friendlyError(err);
            // Offline: open the saved read-only copy if this user was verified as an admin on this device before.
            if (isNetworkError(msg) && uid && (await store.adminFor()) === uid) next = { ok: true, unverified: true, error: '' };
            else next.error = msg;
        }
        setAdmin(next);
        if (!next.ok) return;
        setSeen({ lastViewedAt: await store.lastViewedAt(), readIds: new Set(await store.readIds()), highlight: new Set() });
        load();
        if (!next.unverified) startRealtime();
        const state = await push.permissionState();
        setPushInfo((p) => ({ ...p, state }));
        if (state === 'granted') refreshPush();
        else if (push.pushAvailable && !(await store.pushIntroShown())) setNeedsPushIntro(true);
    }, [load, startRealtime, refreshPush]);

    const signIn = useCallback(async (email, password) => {
        const { data: res, error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));
        if (error) throw error;
        setSession(res.session);
        await afterSignIn(res.session);
    }, [afterSignIn]);

    const signOut = useCallback(async () => {
        await push.unregisterDevice();
        stopRealtime();
        try { await supabase.auth.signOut(); } catch { /* offline: local session is still cleared below */ }
        await store.clearUserData();
        announced.current.clear();
        knownIds.current.clear();
        setSession(null);
        setAdmin({ ok: false, unverified: false, error: '' });
        setData({ inquiries: [], loaded: false, error: '', fromCache: false, total: null });
        setSeen({ lastViewedAt: null, readIds: new Set(), highlight: new Set() });
    }, [stopRealtime]);

    // ---------- unread ("New")
    const isUnread = useCallback((r) => !!seen.lastViewedAt && String(r.created_at) > seen.lastViewedAt && !seen.readIds.has(r.id), [seen]);
    const isNew = useCallback((r) => isUnread(r) || seen.highlight.has(r.id), [isUnread, seen]);
    const unreadCount = useMemo(() => data.inquiries.filter(isUnread).length, [data.inquiries, isUnread]);

    const markListViewed = useCallback(() => {
        const newest = data.inquiries[0] && data.inquiries[0].created_at;
        if (!data.loaded || data.error || !newest) return;
        setSeen((s) => {
            if (s.lastViewedAt && newest <= s.lastViewedAt) return s;
            const highlight = new Set(s.highlight);
            data.inquiries.forEach((r) => { if (String(r.created_at) > (s.lastViewedAt || '')) highlight.add(r.id); });
            store.setLastViewedAt(newest);
            return { ...s, lastViewedAt: newest, highlight };
        });
    }, [data]);

    const markRead = useCallback((id) => {
        setSeen((s) => {
            if (s.readIds.has(id)) return s;
            const readIds = new Set(s.readIds); readIds.add(id);
            store.setReadIds([...readIds]);
            return { ...s, readIds };
        });
    }, []);

    // ---------- startup, connectivity, app foreground, push listeners
    useEffect(() => {
        let mounted = true;
        (async () => {
            const { data: d } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
            if (!mounted) return;
            setSession(d.session);
            if (d.session) await afterSignIn(d.session);
            setBooting(false);
            const id = await push.initialSubmissionId();          // notification tap that launched the app
            if (id) onOpenInquiry(id);
        })();
        const { data: authSub } = supabase.auth.onAuthStateChange((event, s) => {
            if (event === 'SIGNED_OUT') setSession(null);
            else if (s) setSession(s);
        });
        return () => { mounted = false; authSub.subscription.unsubscribe(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => NetInfo.addEventListener((s) => {
        const now = !!s.isConnected && s.isInternetReachable !== false;
        setOnline((was) => {
            if (!was && now && sessionRef.current) afterSignIn(sessionRef.current);   // reconnect: re-check + reload
            return now;
        });
    }), [afterSignIn]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (st) => {
            if (st !== 'active' || !sessionRef.current || !admin.ok) return;
            if (admin.unverified) { afterSignIn(sessionRef.current); return; }
            load();                                        // catch up on anything that arrived in the background
            if (!channel.current) startRealtime();
            refreshPush();                                 // permission may have changed in Android settings; token refresh
        });
        return () => sub.remove();
    }, [admin, afterSignIn, load, startRealtime, refreshPush]);

    useEffect(() => push.listen({
        onOpen: (id) => onOpenInquiry(id),
        onForeground: async (msg) => {                     // Android does not display pushes while the app is open
            const id = push.submissionIdFrom(msg);
            if (!id) return;
            const { row } = await fetchOne(id);
            announce(row || { id, name: null });
        },
        onRegistered: () => setPushInfo((p) => ({ ...p, status: 'registered', message: '' })),
        onError: (e) => setPushInfo((p) => ({ ...p, status: 'error', message: friendlyError(e) }))
    }), [fetchOne, announce, onOpenInquiry]);

    useEffect(() => () => stopRealtime(), [stopRealtime]);

    const value = {
        booting, session, admin, data, online, realtime, pushInfo, needsPushIntro, banner, unreadCount,
        signIn, signOut, retryAdmin: () => afterSignIn(session), reload: load, fetchOne,
        isUnread, isNew, markListViewed, markRead, enablePush, skipPushIntro, dismissBanner: () => setBanner(null)
    };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
