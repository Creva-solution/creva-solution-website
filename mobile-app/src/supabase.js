// Supabase client: same project, logins and RLS as the web Admin Panel.
// The session is stored in AsyncStorage (app-private storage; excluded from backups by the app config).
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});

// Refresh the session only while the app is in the foreground (Supabase's recommended React Native setup).
AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
});

export function withTimeout(promise, ms = 15000) {
    let t;
    return Promise.race([
        promise,
        new Promise((_, rej) => { t = setTimeout(() => rej(new Error('The request timed out. Check your internet connection.')), ms); })
    ]).finally(() => clearTimeout(t));
}

export function friendlyError(err) {
    const msg = (err && (err.message || err.error_description)) || String(err || 'Unknown error');
    if (/Network request failed|Failed to fetch|network|timed out/i.test(msg)) return 'Could not reach the server. Check your internet connection and try again.';
    if (/Invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
    if (/permission denied|JWT|not authorized|42501/i.test(msg)) return 'You are not authorized to view this data. Please sign in with an admin account.';
    return msg;
}
export const isNetworkError = (msg) => /reach the server|timed out/i.test(msg || '');
