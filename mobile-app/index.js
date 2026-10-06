import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';
import { registerBackgroundHandler } from './src/push';
import App from './App';

// Firebase requires the background handler to be registered outside React, before the app renders.
registerBackgroundHandler();

registerRootComponent(App);
