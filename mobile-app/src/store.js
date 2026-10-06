// Small device-local state. Inquiries themselves always come from public.contact_submissions.
import AsyncStorage from '@react-native-async-storage/async-storage';

async function get(key, fallback) {
    try { const v = await AsyncStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
async function set(key, value) { try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } }

const K = {
    lastViewedAt: 'creva.lastViewedAt', readIds: 'creva.readIds', cache: 'creva.cachedInquiries',
    adminFor: 'creva.adminFor', pushIntro: 'creva.pushIntroShown', pushToken: 'creva.pushToken'
};

export const store = {
    lastViewedAt: () => get(K.lastViewedAt, null),
    setLastViewedAt: (v) => set(K.lastViewedAt, v),
    readIds: () => get(K.readIds, []),
    setReadIds: (ids) => set(K.readIds, ids.slice(-500)),
    cachedInquiries: () => get(K.cache, []),
    setCachedInquiries: (rows) => set(K.cache, rows.slice(0, 100)),
    adminFor: () => get(K.adminFor, null),
    setAdminFor: (uid) => set(K.adminFor, uid),
    pushIntroShown: () => get(K.pushIntro, false),
    setPushIntroShown: () => set(K.pushIntro, true),
    pushToken: () => get(K.pushToken, null),
    setPushToken: (t) => set(K.pushToken, t),
    clearUserData: () => AsyncStorage.multiRemove([K.lastViewedAt, K.readIds, K.cache, K.adminFor, K.pushToken])
};
