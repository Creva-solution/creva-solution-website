// Dashboard, Inquiries, Inquiry details, Alerts (notification history) and Settings.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, RefreshControl, ScrollView, Text, TextInput, ToastAndroid, View, Platform, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useApp } from '../AppContext';
import { Button, C, Card, Chip, Note, StateView, fmtDate, s } from '../ui';
import { InquiryItem, OfflineBar, PushCard } from './common';

const KNOWN = ['id', 'created_at', 'name', 'email', 'mobile', 'service', 'message'];
const toast = (msg) => (Platform.OS === 'android' ? ToastAndroid.show(msg, ToastAndroid.SHORT) : Alert.alert(msg));

function usePullToRefresh() {
    const { reload } = useApp();
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => { setRefreshing(true); await reload(); setRefreshing(false); }, [reload]);
    return { refreshing, onRefresh };
}

function ListStatus({ emptyText }) {
    const { data, reload } = useApp();
    if (!data.loaded) return <StateView loading text="Loading inquiries…" />;
    if (data.error && !data.inquiries.length) return <StateView error text={data.error} onRetry={reload} />;
    if (!data.inquiries.length) return <StateView text={emptyText} />;
    return null;
}
function StaleNote() {
    const { data, reload } = useApp();
    if (!data.error && !data.fromCache) return null;
    return <Note text={data.error || 'Showing saved data.'} onRetry={reload} />;
}

export function DashboardScreen({ navigation }) {
    const { data, unreadCount } = useApp();
    const pull = usePullToRefresh();
    const week = data.inquiries.filter((r) => Date.now() - new Date(r.created_at) < 7 * 864e5).length;
    const Stat = ({ label, value, red, onPress }) => (
        <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={[s.card, { flex: 1, marginBottom: 0, padding: 12 }]}>
            <Text style={[s.muted, { fontSize: 12 }]}>{label}</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: red ? C.red : C.dark, marginTop: 4 }}>{value}</Text>
        </Pressable>
    );
    const status = <ListStatus emptyText="No inquiries yet. New contact form submissions will appear here." />;
    return (
        <View style={s.screen}>
            <OfflineBar />
            <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl {...pull} colors={[C.primary]} />}>
                <StaleNote />
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                    <Stat label="Total inquiries" value={data.total == null ? '–' : data.total} onPress={() => navigation.navigate('Inquiries')} />
                    <Stat label="New inquiries" value={data.loaded ? unreadCount : '–'} red={unreadCount > 0} onPress={() => navigation.navigate('Inquiries')} />
                    <Stat label="Last 7 days" value={data.loaded ? week : '–'} />
                </View>
                <PushCard compact />
                <Text style={s.h2}>Recent inquiries</Text>
                {status || <>
                    {data.inquiries.slice(0, 5).map((r) => <InquiryItem key={r.id} row={r} onPress={() => navigation.navigate('Inquiry', { id: r.id })} />)}
                    <Button title="View all inquiries" onPress={() => navigation.navigate('Inquiries')} />
                </>}
            </ScrollView>
        </View>
    );
}

export function InquiriesScreen({ navigation }) {
    const { data, markListViewed } = useApp();
    const [q, setQ] = useState('');
    const pull = usePullToRefresh();
    // Opening the list marks everything up to now as seen (rows keep their "NEW" tag during this visit).
    useFocusEffect(useCallback(() => { markListViewed(); }, [markListViewed]));
    const list = useMemo(() => {
        const t = q.trim().toLowerCase();
        return t ? data.inquiries.filter((r) => ['name', 'email', 'mobile', 'service', 'message'].some((k) => String(r[k] || '').toLowerCase().includes(t))) : data.inquiries;
    }, [q, data.inquiries]);
    const status = <ListStatus emptyText="No inquiries yet. New contact form submissions will appear here." />;
    return (
        <View style={s.screen}>
            <OfflineBar />
            <View style={{ padding: 16, paddingBottom: 4 }}>
                <TextInput style={s.input} value={q} onChangeText={setQ} placeholder="Search name, email, mobile, service" placeholderTextColor={C.muted}
                    accessibilityLabel="Search inquiries" clearButtonMode="while-editing" autoCapitalize="none" />
            </View>
            {status ? <View style={{ flex: 1 }}>{status}</View> : (
                <FlatList data={list} keyExtractor={(r) => r.id} contentContainerStyle={s.content}
                    ListHeaderComponent={<StaleNote />}
                    ListEmptyComponent={<StateView text="No inquiries match your search." />}
                    refreshControl={<RefreshControl {...pull} colors={[C.primary]} />}
                    renderItem={({ item }) => <InquiryItem row={item} onPress={() => navigation.navigate('Inquiry', { id: item.id })} />} />
            )}
        </View>
    );
}

export function InquiryScreen({ route, navigation }) {
    const { id } = route.params || {};
    const { fetchOne, markRead } = useApp();
    const [state, setState] = useState({ loading: true });
    const load = useCallback(async () => {
        setState({ loading: true });
        const res = await fetchOne(id);
        setState({ loading: false, ...res });
        if (res.row) markRead(res.row.id);
    }, [id, fetchOne, markRead]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [id]);

    if (state.loading) return <View style={s.screen}><StateView loading text="Loading inquiry…" /></View>;
    const row = state.row;
    if (!row) return (
        <View style={s.screen}>
            <StateView error text={state.error || 'This inquiry was not found. It may have been removed.'} onRetry={state.error ? load : undefined} />
            <Button title="Back to inquiries" onPress={() => navigation.navigate('Tabs', { screen: 'Inquiries' })} style={{ marginHorizontal: 24 }} />
        </View>
    );
    const extra = Object.keys(row).filter((k) => !KNOWN.includes(k) && row[k] != null && row[k] !== '');
    const tel = 'tel:' + String(row.mobile || '').replace(/[^\d+]/g, '');
    const copy = async (value, label) => { await Clipboard.setStringAsync(value); toast(label + ' copied'); };
    const Field = ({ label, value }) => (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <Text style={[s.muted, { width: 70, textTransform: 'capitalize' }]}>{label}</Text>
            <Text selectable style={{ flex: 1, fontWeight: '500', color: C.text }}>{value}</Text>
        </View>
    );
    return (
        <ScrollView style={s.screen} contentContainerStyle={s.content}>
            {state.offline && <Note text="Offline: showing saved copy." />}
            <Card>
                <Text selectable style={{ fontSize: 22, fontWeight: '800', color: C.dark }}>{row.name || 'No name'}</Text>
                <Text style={[s.muted, { marginTop: 2 }]}>{fmtDate(row.created_at)}</Text>
                {!!row.service && <View style={{ flexDirection: 'row', marginTop: 8 }}><Chip label={row.service} /></View>}
                {!!row.email && <Field label="Email" value={row.email} />}
                {!!row.mobile && <Field label="Mobile" value={row.mobile} />}
                {extra.map((k) => <Field key={k} label={k.replace(/_/g, ' ')} value={typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k])} />)}
                {!!row.message && <>
                    <Text style={[s.muted, { marginTop: 16, marginBottom: 6, fontWeight: '600' }]}>Message</Text>
                    <Text selectable style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, lineHeight: 22, color: C.text }}>{row.message}</Text>
                </>}
            </Card>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {!!row.mobile && <Button kind="primary" title="📞 Call" onPress={() => Linking.openURL(tel)} style={{ flexGrow: 1, flexBasis: '45%' }} />}
                {!!row.email && <Button kind="primary" title="✉ Email" style={{ flexGrow: 1, flexBasis: '45%' }}
                    onPress={() => Linking.openURL(`mailto:${row.email}?subject=${encodeURIComponent('Re: Your inquiry to Creva Solutions')}`)} />}
                {!!row.mobile && <Button title="Copy mobile" onPress={() => copy(row.mobile, 'Mobile number')} style={{ flexGrow: 1, flexBasis: '45%' }} />}
                {!!row.email && <Button title="Copy email" onPress={() => copy(row.email, 'Email')} style={{ flexGrow: 1, flexBasis: '45%' }} />}
            </View>
            <Text selectable style={[s.muted, s.small, { marginTop: 16 }]}>Inquiry ID: {row.id}</Text>
        </ScrollView>
    );
}

export function AlertsScreen({ navigation }) {
    const { data } = useApp();
    const pull = usePullToRefresh();
    const status = <ListStatus emptyText="No notifications yet." />;
    return (
        <View style={s.screen}>
            <OfflineBar />
            <FlatList data={status ? [] : data.inquiries.slice(0, 50)} keyExtractor={(r) => r.id} contentContainerStyle={s.content}
                refreshControl={<RefreshControl {...pull} colors={[C.primary]} />}
                ListHeaderComponent={<>
                    <PushCard />
                    <Text style={s.h2}>Inquiry notifications</Text>
                    <Text style={[s.muted, s.small, { marginBottom: 10 }]}>Every website inquiry, newest first (from contact_submissions).</Text>
                    {status}
                </>}
                renderItem={({ item }) => <InquiryItem alert row={item} onPress={() => navigation.navigate('Inquiry', { id: item.id })} />} />
        </View>
    );
}

export function SettingsScreen() {
    const { session, admin, realtime, signOut } = useApp();
    const confirmLogout = () => Alert.alert('Log out?', 'This device will stop receiving inquiry notifications.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: signOut }
    ]);
    const live = {
        live: 'Connected: new inquiries appear instantly while the app is open.', connecting: 'Connecting…',
        unavailable: 'Realtime is not enabled for contact_submissions (run admin/realtime_setup.sql). Pull down to refresh still works.',
        off: 'Disconnected. The list refreshes when the app reconnects.'
    }[realtime];
    return (
        <ScrollView style={s.screen} contentContainerStyle={s.content}>
            <Card>
                <Text style={s.cardTitle}>Account</Text>
                <Text style={s.muted}>Signed in as</Text>
                <Text style={{ fontWeight: '700', marginBottom: 8 }}>{session && session.user && session.user.email}</Text>
                <Text style={s.muted}>Role</Text>
                <Text>{admin.ok ? (admin.unverified ? 'Admin (offline – will re-check when online)' : 'Authorized admin ✓') : 'Not an admin'}</Text>
            </Card>
            <PushCard />
            <Card><Text style={s.cardTitle}>Live updates</Text><Text>{live}</Text></Card>
            <Card>
                <Text style={s.cardTitle}>About</Text>
                <Text style={s.muted}>Creva Admin · version {Constants.expoConfig && Constants.expoConfig.version}{'\n'}Same data and logins as the web Admin Panel.</Text>
            </Card>
            <Button kind="danger" title="Log out" onPress={confirmLogout} />
        </ScrollView>
    );
}
