// Login, "not an admin", and the first-run notification permission screen.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../AppContext';
import { friendlyError } from '../supabase';
import { Button, C, s } from '../ui';
import { PermissionHelp } from './common';

const logo = require('../../assets/icon.png');

export function LoginScreen() {
    const { signIn } = useApp();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function submit() {
        if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
        setBusy(true); setError('');
        try { await signIn(email.trim(), password); }
        catch (e) { setError(friendlyError(e)); }
        finally { setBusy(false); }
    }

    return (
        <SafeAreaView style={[s.screen, { backgroundColor: '#fff' }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
                    <Image source={logo} style={{ width: 96, height: 96, borderRadius: 20, marginBottom: 12 }} accessibilityIgnoresInvertColors accessible={false} />
                    <Text style={{ fontSize: 26, fontWeight: '800', color: C.dark }}>Admin Login</Text>
                    <Text style={[s.muted, { marginBottom: 20 }]}>Sign in with your Creva Solutions admin account.</Text>
                    <Text style={{ fontWeight: '600', marginBottom: 6 }}>Email</Text>
                    <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email"
                        keyboardType="email-address" textContentType="username" accessibilityLabel="Email" returnKeyType="next" />
                    <Text style={{ fontWeight: '600', marginTop: 16, marginBottom: 6 }}>Password</Text>
                    <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password"
                        textContentType="password" accessibilityLabel="Password" returnKeyType="go" onSubmitEditing={submit} />
                    {!!error && <Text accessibilityRole="alert" style={{ color: C.danger, marginTop: 12 }}>{error}</Text>}
                    <Button kind="primary" title={busy ? 'Signing in…' : 'Sign In'} disabled={busy} onPress={submit} style={{ marginTop: 20 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

export function NotAdminScreen() {
    const { admin, retryAdmin, signOut } = useApp();
    return (
        <SafeAreaView style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: C.dark, marginBottom: 8 }}>Access restricted</Text>
            <Text style={[s.muted, { marginBottom: 20 }]}>{admin.error || 'This account is not an authorized admin.'}</Text>
            <Button kind="primary" title="Try again" onPress={retryAdmin} />
            <Button title="Sign out" onPress={signOut} style={{ marginTop: 10 }} />
        </SafeAreaView>
    );
}

export function PushSetupScreen() {
    const { enablePush, skipPushIntro, pushInfo } = useApp();
    const blocked = pushInfo.state === 'blocked' || pushInfo.state === 'denied';
    return (
        <SafeAreaView style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
            <Text style={{ fontSize: 48, marginBottom: 8 }} accessible={false}>🔔</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: C.dark, marginBottom: 8 }}>Turn on inquiry notifications</Text>
            <Text style={[s.muted, { marginBottom: 20 }]}>
                Creva Admin uses notifications to tell you the moment someone submits the contact form on crevasolution.in,
                even when the app is closed or your phone is locked.
            </Text>
            {blocked ? <PermissionHelp /> : <Button kind="primary" title="Allow notifications" onPress={enablePush} />}
            <Button title={blocked ? 'Continue' : 'Not now'} onPress={skipPushIntro} style={{ marginTop: 10 }} />
            <View style={{ height: 24 }} />
        </SafeAreaView>
    );
}
