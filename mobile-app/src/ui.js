// Shared look and small components (brand colours from crevasolution.in).
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export const C = {
    primary: '#3C77C3', primaryDark: '#2f5f9e', dark: '#0b1a3c', text: '#1f2937', muted: '#6b7280',
    line: '#e5e7eb', bg: '#f5f7fb', card: '#ffffff', danger: '#b91c1c', red: '#dc2626', ok: '#10b981', warn: '#f59e0b'
};

export const fmtDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const ago = (iso) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return fmtDate(iso);
};

export function Button({ title, onPress, kind = 'default', disabled, style, accessibilityLabel }) {
    const k = kind === 'primary' ? s.btnPrimary : kind === 'danger' ? s.btnDanger : null;
    const t = kind === 'primary' ? s.btnTextPrimary : kind === 'danger' ? s.btnTextDanger : null;
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} disabled={disabled} onPress={onPress}
            style={({ pressed }) => [s.btn, k, pressed && { opacity: 0.8 }, disabled && { opacity: 0.6 }, style]}>
            <Text style={[s.btnText, t]}>{title}</Text>
        </Pressable>
    );
}

export function Card({ children, warn, style }) {
    return <View style={[s.card, warn && s.cardWarn, style]}>{children}</View>;
}

export function StateView({ loading, text, error, onRetry }) {
    return (
        <View style={s.state}>
            {loading && <ActivityIndicator color={C.primary} size="large" />}
            {!!text && <Text style={[s.stateText, error && { color: C.danger }]}>{text}</Text>}
            {onRetry && <Button title="Try again" onPress={onRetry} />}
        </View>
    );
}

export function Note({ text, onRetry }) {
    return (
        <View style={s.note}>
            <Text style={s.noteText}>{text}</Text>
            {onRetry && <Text accessibilityRole="button" onPress={onRetry} style={s.noteLink}>Retry</Text>}
        </View>
    );
}

export function Tag({ label }) {
    return <Text style={s.tag}>{label}</Text>;
}
export function Chip({ label }) {
    return <Text style={s.chip}>{label}</Text>;
}

export const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 32 },
    h2: { fontSize: 16, fontWeight: '700', color: C.dark, marginTop: 18, marginBottom: 10 },
    muted: { color: C.muted },
    small: { fontSize: 13 },
    btn: { minHeight: 48, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    btnPrimary: { backgroundColor: C.primary, borderColor: C.primary },
    btnDanger: { borderColor: '#fecaca' },
    btnText: { fontSize: 15, fontWeight: '600', color: C.text },
    btnTextPrimary: { color: '#fff' },
    btnTextDanger: { color: C.danger },
    card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardWarn: { borderColor: '#fed7aa', backgroundColor: '#fffbf5' },
    cardTitle: { fontSize: 16, fontWeight: '700', color: C.dark, marginBottom: 6 },
    state: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
    stateText: { color: C.muted, textAlign: 'center', fontSize: 15 },
    note: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12 },
    noteText: { color: '#92400e', fontSize: 13, flexShrink: 1 },
    noteLink: { color: C.primary, fontWeight: '700', fontSize: 13 },
    tag: { backgroundColor: '#fee2e2', color: C.red, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
    chip: { backgroundColor: '#eff6ff', color: C.primary, fontSize: 12, fontWeight: '600', paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
    input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.text }
});
