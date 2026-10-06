import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useApp } from '../AppContext';
import { pushAvailable } from '../push';
import { PUSH_CONFIGURED } from '../config';
import { Button, C, Card, Chip, Tag, fmtDate, s } from '../ui';

export function PermissionHelp() {
    return (
        <View>
            <Text style={{ fontWeight: '700', marginBottom: 6 }}>Notifications are blocked.</Text>
            <Text style={s.muted}>To receive new inquiries: open Android Settings → Apps → Creva Admin → Notifications, turn them on and make sure “New inquiries” is allowed.</Text>
            <Button title="Open app settings" onPress={() => Linking.openSettings()} style={{ marginTop: 12 }} />
        </View>
    );
}

export function PushCard({ compact }) {
    const { pushInfo, enablePush } = useApp();
    if (!pushAvailable) {
        if (compact) return null;
        return (
            <Card>
                <Text style={s.cardTitle}>Notifications</Text>
                <Text style={s.muted}>{PUSH_CONFIGURED
                    ? 'Push notifications are available on Android.'
                    : 'Push notifications are not set up in this version of the app yet (Firebase configuration missing). New inquiries still appear here while the app is open.'}</Text>
            </Card>
        );
    }
    const st = pushInfo.state;
    if (st === 'granted' && compact && pushInfo.status !== 'error') return null;
    return (
        <Card warn={st !== 'granted' || pushInfo.status === 'error'}>
            <Text style={s.cardTitle}>Notifications</Text>
            {st === 'granted' && <Text>Enabled ✓{pushInfo.status === 'registered' ? ' – this device is registered for inquiry alerts.' : ''}</Text>}
            {st === 'granted' && pushInfo.status === 'error' && <>
                <Text style={{ color: C.danger, marginTop: 6 }}>{pushInfo.message}</Text>
                <Button title="Retry registration" onPress={enablePush} style={{ marginTop: 10 }} />
            </>}
            {(st === 'blocked' || st === 'denied') && <PermissionHelp />}
            {st === 'prompt' && <>
                <Text style={{ marginBottom: 10 }}>Get a notification the moment a website inquiry arrives.</Text>
                <Button kind="primary" title="Allow notifications" onPress={enablePush} />
            </>}
        </Card>
    );
}

export function InquiryItem({ row, onPress, alert }) {
    const { isNew } = useApp();
    const fresh = isNew(row);
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={`Inquiry from ${row.name || 'unknown'}${fresh ? ', new' : ''}`} onPress={onPress}
            style={({ pressed }) => [s.card, { marginBottom: 10, paddingVertical: 14 }, fresh && { borderLeftWidth: 4, borderLeftColor: C.red }, pressed && { backgroundColor: '#f3f4f6' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '700', fontSize: 15, flexShrink: 1, color: C.text }} numberOfLines={2}>
                    {alert ? `🔔 New inquiry from ${row.name || 'a website visitor'}` : (row.name || 'No name')}
                </Text>
                {fresh && <Tag label="NEW" />}
            </View>
            {!alert && <Text style={[s.muted, { marginTop: 2 }]} numberOfLines={1}>{row.email || ''}{row.mobile ? ' · ' + row.mobile : ''}</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
                {!alert && !!row.service && <Chip label={row.service} />}
                <Text style={[s.muted, s.small]}>{fmtDate(row.created_at)}</Text>
            </View>
        </Pressable>
    );
}

export function LiveDot() {
    const { realtime } = useApp();
    const color = realtime === 'live' ? C.ok : realtime === 'connecting' ? '#9ca3af' : C.warn;
    const label = { live: 'Live updates on', connecting: 'Connecting', unavailable: 'Live updates not enabled', off: 'Live updates disconnected' }[realtime];
    return <View accessible accessibilityLabel={label} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 16 }} />;
}

export function OfflineBar() {
    const { online } = useApp();
    if (online) return null;
    return <Text style={{ backgroundColor: '#fff7ed', color: '#9a3412', textAlign: 'center', padding: 8, fontSize: 13 }}>You are offline. Showing the last saved inquiries.</Text>;
}
