// Expo app configuration for the Creva Admin React Native app.
const fs = require('fs');
const path = require('path');

// Same Supabase project as the web Admin Panel: read the PUBLIC URL + anon key from admin/js/config.js.
const adminConfig = fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'config.js'), 'utf8');
const supabaseUrl = (/SUPABASE_URL\s*=\s*'([^']+)'/.exec(adminConfig) || [])[1];
const supabaseAnonKey = (/SUPABASE_ANON_PUBLIC_KEY\s*=\s*'([^']+)'/.exec(adminConfig) || [])[1];
if (!supabaseUrl || !supabaseAnonKey) throw new Error('Could not read Supabase URL / anon key from admin/js/config.js');
if (/service_role/.test(Buffer.from(supabaseAnonKey.split('.')[1] || '', 'base64').toString())) {
    throw new Error('admin/js/config.js contains a service_role key. Only the public anon key may be used in apps.');
}

// Push needs google-services.json from the Firebase console (see README). Without it the app builds and works,
// with push turned off (Firebase native modules are not linked, so nothing can crash).
const GOOGLE_SERVICES = './google-services.json';
const pushConfigured = fs.existsSync(path.join(__dirname, GOOGLE_SERVICES));

module.exports = {
    expo: {
        name: 'Creva Admin',
        slug: 'creva-admin',
        version: '1.0.0',
        orientation: 'portrait',
        icon: './assets/icon.png',
        userInterfaceStyle: 'light',
        primaryColor: '#3C77C3',
        android: {
            package: 'com.crevasolution.admin',
            versionCode: 1,
            adaptiveIcon: {
                backgroundColor: '#FFFFFF',
                foregroundImage: './assets/android-icon-foreground.png',
                backgroundImage: './assets/android-icon-background.png',
                monochromeImage: './assets/android-icon-monochrome.png'
            },
            allowBackup: false,                     // keep the admin session out of cloud backups
            permissions: ['android.permission.POST_NOTIFICATIONS', 'android.permission.ACCESS_NETWORK_STATE'],
            // not used by this app (added by the Expo template / libraries)
            blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
            ...(pushConfigured ? { googleServicesFile: GOOGLE_SERVICES } : {})
        },
        ios: { bundleIdentifier: 'com.crevasolution.admin', supportsTablet: false },
        plugins: [
            ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 220, backgroundColor: '#FFFFFF' }],
            ...(pushConfigured ? ['@react-native-firebase/app', '@react-native-firebase/messaging'] : []),
            './plugins/withInquiryNotifications'
        ],
        extra: { supabaseUrl, supabaseAnonKey, pushConfigured }
    }
};
