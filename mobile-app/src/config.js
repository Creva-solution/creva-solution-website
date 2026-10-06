// Values injected at build time by app.config.js (public Supabase URL + anon key only).
import Constants from 'expo-constants';

const extra = (Constants.expoConfig && Constants.expoConfig.extra) || {};
export const SUPABASE_URL = extra.supabaseUrl;
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey;
export const PUSH_CONFIGURED = extra.pushConfigured === true;   // google-services.json present at build time
export const TABLE = 'contact_submissions';
export const CHANNEL_ID = 'inquiries';
