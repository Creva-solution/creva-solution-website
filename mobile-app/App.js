// Creva Admin – React Native app shell: navigation, in-app banner, notification deep links.
import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer, createNavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/AppContext';
import { C, StateView } from './src/ui';
import { LoginScreen, NotAdminScreen, PushSetupScreen } from './src/screens/AuthScreens';
import { DashboardScreen, InquiriesScreen, InquiryScreen, AlertsScreen, SettingsScreen } from './src/screens/MainScreens';
import { LiveDot } from './src/screens/common';

SplashScreen.preventAutoHideAsync().catch(() => {});

const navRef = createNavigationContainerRef();
const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: C.primary, background: C.bg } };
const icon = (glyph) => ({ color }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

function TabsScreen() {
    const { unreadCount } = useApp();
    return (
        <Tabs.Navigator screenOptions={{
            headerRight: () => <LiveDot />, tabBarActiveTintColor: C.primary, tabBarInactiveTintColor: C.muted,
            headerTitleStyle: { color: C.dark, fontWeight: '700' }
        }}>
            <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarIcon: icon('▦') }} />
            <Tabs.Screen name="Inquiries" component={InquiriesScreen}
                options={{ tabBarIcon: icon('✉'), tabBarBadge: unreadCount ? (unreadCount > 99 ? '99+' : unreadCount) : undefined, tabBarBadgeStyle: { backgroundColor: C.red } }} />
            <Tabs.Screen name="Alerts" component={AlertsScreen} options={{ tabBarIcon: icon('🔔') }} />
            <Tabs.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: icon('⚙') }} />
        </Tabs.Navigator>
    );
}

function Banner() {
    const { banner, dismissBanner } = useApp();
    const insets = useSafeAreaInsets();
    useEffect(() => { if (!banner) return undefined; const t = setTimeout(dismissBanner, 10000); return () => clearTimeout(t); }, [banner, dismissBanner]);
    if (!banner) return null;
    const open = () => { dismissBanner(); if (navRef.isReady()) navRef.navigate('Inquiry', { id: banner.id }); };
    return (
        <View accessibilityRole="alert" style={{
            position: 'absolute', top: insets.top + 8, left: 12, right: 12, backgroundColor: '#fff', borderRadius: 12,
            borderLeftWidth: 4, borderLeftColor: C.primary, padding: 14, paddingRight: 44, elevation: 8,
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }
        }}>
            <Text style={{ fontWeight: '800', color: C.dark }}>🔔 New Contact Inquiry</Text>
            <Text style={{ color: C.text, marginTop: 2 }} numberOfLines={2}>New inquiry received from {banner.name}</Text>
            <Text accessibilityRole="button" onPress={open} style={{ color: C.primary, fontWeight: '700', marginTop: 8 }}>View inquiry</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismissBanner} hitSlop={10}
                style={{ position: 'absolute', top: 6, right: 6, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22, color: C.muted }}>×</Text>
            </Pressable>
        </View>
    );
}

function Root({ pending, flushPending }) {
    const { booting, session, admin, needsPushIntro } = useApp();
    useEffect(() => { if (!booting) SplashScreen.hideAsync().catch(() => {}); }, [booting]);
    const ready = !booting && session && admin.ok && !needsPushIntro;
    useEffect(() => { if (ready) flushPending(); }, [ready, flushPending]);
    if (booting) return <StateView loading text="Loading…" />;
    return (
        <Stack.Navigator screenOptions={{ headerTitleStyle: { color: C.dark, fontWeight: '700' } }}>
            {!session ? <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
                : !admin.ok ? <Stack.Screen name="NotAdmin" component={NotAdminScreen} options={{ headerShown: false }} />
                    : needsPushIntro ? <Stack.Screen name="PushSetup" component={PushSetupScreen} options={{ headerShown: false }} />
                        : <>
                            <Stack.Screen name="Tabs" component={TabsScreen} options={{ headerShown: false }} />
                            <Stack.Screen name="Inquiry" component={InquiryScreen} options={{ title: 'Inquiry', headerRight: () => <LiveDot /> }} />
                        </>}
        </Stack.Navigator>
    );
}

export default function App() {
    // A notification tap can arrive before login/navigation is ready (cold start): keep it until the app can show it.
    const pending = useRef(null);
    const flushPending = useCallback(() => {
        if (pending.current && navRef.isReady() && navRef.getRootState()?.routeNames?.includes('Inquiry')) {
            const id = pending.current; pending.current = null;
            navRef.navigate('Inquiry', { id });
        }
    }, []);
    const openInquiry = useCallback((id) => { pending.current = id; flushPending(); }, [flushPending]);

    return (
        <SafeAreaProvider>
            <AppProvider onOpenInquiry={openInquiry}>
                <NavigationContainer ref={navRef} theme={theme} onReady={flushPending} onStateChange={flushPending}>
                    <StatusBar style="dark" />
                    <Root pending={pending} flushPending={flushPending} />
                    <Banner />
                </NavigationContainer>
            </AppProvider>
        </SafeAreaProvider>
    );
}
