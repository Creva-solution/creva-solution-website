// Firebase Cloud Messaging (React Native Firebase, modular API).
// The app only RECEIVES pushes. Sending is server-side:
//   contact_submissions INSERT -> Database Webhook -> Edge Function "send-admin-push" -> FCM.
// Firebase is loaded lazily so a build without google-services.json (push disabled) never touches it.
import { PermissionsAndroid, Platform } from 'react-native';
import * as Device from 'expo-device';
import { supabase, withTimeout } from './supabase';
import { store } from './store';
import { PUSH_CONFIGURED } from './config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const pushAvailable = PUSH_CONFIGURED && Platform.OS === 'android';

let fcm = null;
function messaging() {
    if (!pushAvailable) return null;
    if (!fcm) {
        const m = require('@react-native-firebase/messaging');
        fcm = { ...m, instance: m.getMessaging() };
    }
    return fcm;
}

export function submissionIdFrom(remoteMessage) {
    const id = remoteMessage && remoteMessage.data && remoteMessage.data.submission_id;
    return typeof id === 'string' && UUID.test(id) ? id : null;
}

// Must run at startup (index.js), outside React: handles data messages while the app is in the background.
// Our pushes are "notification" messages, which Android displays itself; nothing else is needed here.
export function registerBackgroundHandler() {
    const m = messaging();
    if (m) m.setBackgroundMessageHandler(m.instance, async () => {});
}

// 'granted' | 'denied' | 'blocked' | 'prompt' | 'unavailable'
export async function permissionState() {
    if (!pushAvailable) return 'unavailable';
    if (Platform.Version < 33) return 'granted';                 // before Android 13 there is no runtime permission
    const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return ok ? 'granted' : 'prompt';
}

// Shows the Android 13+ POST_NOTIFICATIONS system dialog, then registers the device.
export async function requestPermissionAndRegister() {
    if (!pushAvailable) return 'unavailable';
    let state = 'granted';
    if (Platform.Version >= 33) {
        const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
            title: 'Allow inquiry notifications',
            message: 'Creva Admin notifies you the moment someone submits the contact form on crevasolution.in.',
            buttonPositive: 'Allow'
        });
        state = r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
    }
    if (state === 'granted') await registerDevice();
    return state;
}

// Gets the current FCM token and stores it server-side for the signed-in admin.
export async function registerDevice() {
    const m = messaging();
    if (!m) return;
    const token = await m.getToken(m.instance);
    await saveToken(token);
}

async function saveToken(token) {
    if (!token) return;
    const deviceName = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ').slice(0, 100) || null;
    // SECURITY DEFINER function: accepts the token only if the signed-in user is in public.admin_users.
    const { error } = await withTimeout(supabase.rpc('register_admin_push_token', {
        p_token: token, p_platform: Platform.OS, p_device_name: deviceName
    }));
    if (error) throw error;
    await store.setPushToken(token);
}

// Listeners used while the app is running. Returns an unsubscribe function.
export function listen({ onOpen, onForeground, onRegistered, onError }) {
    const m = messaging();
    if (!m) return () => {};
    const subs = [
        m.onNotificationOpenedApp(m.instance, (msg) => { const id = submissionIdFrom(msg); if (id) onOpen(id); }),   // app was in background
        m.onMessage(m.instance, (msg) => onForeground(msg)),                                                          // app open: Android shows nothing
        m.onTokenRefresh(m.instance, (token) => saveToken(token).then(onRegistered).catch(onError))                    // Firebase rotated the token
    ];
    return () => subs.forEach((u) => u());
}

// The notification that launched the app from a fully closed state (if any).
export async function initialSubmissionId() {
    const m = messaging();
    if (!m) return null;
    try { return submissionIdFrom(await m.getInitialNotification(m.instance)); } catch { return null; }
}

// On logout: remove this device for this admin, and drop the FCM token so a reinstall/next login gets a new one.
export async function unregisterDevice() {
    const m = messaging();
    if (!m) return;
    const token = await store.pushToken();
    if (token) {
        try { await withTimeout(supabase.rpc('unregister_admin_push_token', { p_token: token }), 8000); } catch { /* offline: FCM reports it invalid later and the server removes it */ }
    }
    try { await m.deleteToken(m.instance); } catch { /* ignore */ }
}
