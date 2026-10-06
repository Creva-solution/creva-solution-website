// Expo config plugin (runs during `expo prebuild`):
//  1. Creates the Android notification channel "inquiries" in MainApplication.onCreate, so pushes that arrive
//     while the app has never been opened since install still use a high-importance channel.
//  2. Makes "inquiries" the default Firebase notification channel.
//  3. Adds the white bell status-bar icon + brand colour as Firebase's default notification icon.
//  4. Excludes app data (admin session, cached inquiries) from Android 12+ cloud backup and device transfer.
const fs = require('fs');
const path = require('path');
const { withMainApplication, withAndroidManifest, withAndroidColors, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

const CHANNEL_ID = 'inquiries';
const CHANNEL_CODE = `
        // Creva Admin: notification channel for new contact inquiries (Android 8+)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel("${CHANNEL_ID}", "New inquiries", android.app.NotificationManager.IMPORTANCE_HIGH)
            channel.description = "New contact form inquiries from crevasolution.in"
            channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
            channel.enableVibration(true)
            (getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).createNotificationChannel(channel)
        }`;

function withChannel(config) {
    return withMainApplication(config, (cfg) => {
        let src = cfg.modResults.contents;
        if (cfg.modResults.language !== 'kt') throw new Error('withInquiryNotifications expects a Kotlin MainApplication');
        if (!src.includes(`NotificationChannel("${CHANNEL_ID}"`)) {
            const anchor = /super\.onCreate\(\)/;
            if (!anchor.test(src)) throw new Error('Could not find super.onCreate() in MainApplication.kt');
            src = src.replace(anchor, (m) => m + CHANNEL_CODE);
        }
        cfg.modResults.contents = src;
        return cfg;
    });
}

function withManifest(config) {
    return withAndroidManifest(config, (cfg) => {
        const manifest = cfg.modResults;
        manifest.manifest.$['xmlns:tools'] = manifest.manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
        const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
        app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
        const FCM = 'com.google.firebase.messaging.default_notification_';
        app['meta-data'] = (app['meta-data'] || []).filter(m => !String(m.$['android:name']).startsWith(FCM));
        app['meta-data'].push(
            { $: { 'android:name': FCM + 'channel_id', 'android:value': CHANNEL_ID, 'tools:replace': 'android:value' } },
            { $: { 'android:name': FCM + 'icon', 'android:resource': '@drawable/ic_stat_notification', 'tools:replace': 'android:resource' } },
            { $: { 'android:name': FCM + 'color', 'android:resource': '@color/notification_color', 'tools:replace': 'android:resource' } }
        );
        return cfg;
    });
}

function withNotificationColor(config) {
    return withAndroidColors(config, (cfg) => {
        cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, { name: 'notification_color', value: '#3C77C3' });
        return cfg;
    });
}

function withBackupRules(config) {
    return withDangerousMod(config, ['android', async (cfg) => {
        const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
        // white bell notification icon (assets/notification-icon/drawable-*/ic_stat_notification.png)
        const iconSrc = path.join(cfg.modRequest.projectRoot, 'assets', 'notification-icon');
        for (const d of fs.readdirSync(iconSrc)) {
            fs.mkdirSync(path.join(res, d), { recursive: true });
            fs.copyFileSync(path.join(iconSrc, d, 'ic_stat_notification.png'), path.join(res, d, 'ic_stat_notification.png'));
        }
        const dir = path.join(res, 'xml');
        fs.mkdirSync(dir, { recursive: true });
        const domains = ['root', 'file', 'database', 'sharedpref'].map(d => `        <exclude domain="${d}" />`).join('\n');
        fs.writeFileSync(path.join(dir, 'data_extraction_rules.xml'),
            `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n    <cloud-backup>\n${domains}\n    </cloud-backup>\n    <device-transfer>\n${domains}\n    </device-transfer>\n</data-extraction-rules>\n`);
        return cfg;
    }]);
}

module.exports = (config) => withBackupRules(withNotificationColor(withManifest(withChannel(config))));
