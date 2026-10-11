import { useEffect, useRef, useState } from 'react';
import { Stack, router, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { useColorScheme } from 'react-native';
import { notificationsSupported } from '@/src/services/notification-support';
import { initializeApp } from '@/src/store/app-store';
import { useLeadrove } from '@/src/store/use-leadrove';
import { useColors, type } from '@/src/theme';

export default function RootLayout() {
  const c = useColors(); const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold });
  const { hydrated, leads } = useLeadrove();
  const navigation = useRootNavigationState();
  const [pendingLead, setPendingLead] = useState<{ id: string | null; notificationId: string } | null>(null);
  const handled = useRef<string | null>(null);
  useEffect(() => initializeApp(), []);
  useEffect(() => {
    if (!notificationsSupported()) return;
    let disposed = false; let subscription: { remove: () => void } | undefined;
    void import('expo-notifications').then(Notifications => {
      if (disposed) return;
      const receive = (response: import('expo-notifications').NotificationResponse | null) => {
        if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
        const notificationId = response.notification.request.identifier;
        if (handled.current === notificationId) return;
        const leadId = response.notification.request.content.data?.leadId;
        setPendingLead({ id: typeof leadId === 'string' ? leadId : null, notificationId });
      };
      subscription = Notifications.addNotificationResponseReceivedListener(receive);
      receive(Notifications.getLastNotificationResponse());
    }).catch(() => { /* Discovery still works when notifications are unavailable. */ });
    return () => { disposed = true; subscription?.remove(); };
  }, []);
  useEffect(() => {
    if (!pendingLead || !hydrated || !navigation?.key || (!fontsLoaded && !fontError)) return;
    handled.current = pendingLead.notificationId;
    if (pendingLead.id && leads.some(lead => lead.id === pendingLead.id && !lead.dismissed)) router.push({ pathname: '/business/[id]', params: { id: pendingLead.id } });
    else router.push('/nearby');
    setPendingLead(null);
    void import('expo-notifications').then(Notifications => Notifications.clearLastNotificationResponse()).catch(() => {});
  }, [pendingLead, hydrated, navigation?.key, fontsLoaded, fontError, leads]);
  if (!fontsLoaded && !fontError) return null;
  return <><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} /><Stack screenOptions={{ headerStyle: { backgroundColor: c.canvas }, headerTintColor: c.ink, headerTitleStyle: type.heading, headerShadowVisible: false, contentStyle: { backgroundColor: c.canvas } }}><Stack.Screen name="(tabs)" options={{ headerShown: false }} /><Stack.Screen name="settings" options={{ title: 'Settings' }} /><Stack.Screen name="business/[id]" options={{ title: 'Business' }} /></Stack></>;
}
