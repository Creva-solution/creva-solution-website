// Without google-services.json the Firebase native modules are not linked (push disabled, no crash risk).
const fs = require('fs');
const path = require('path');

const pushConfigured = fs.existsSync(path.join(__dirname, 'google-services.json'));

module.exports = {
    dependencies: pushConfigured ? {} : {
        '@react-native-firebase/app': { platforms: { android: null, ios: null } },
        '@react-native-firebase/messaging': { platforms: { android: null, ios: null } }
    }
};
