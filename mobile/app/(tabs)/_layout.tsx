import { Tabs, router } from 'expo-router';
import { House, Radar, Search, Bookmark, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/src/components/ui';
import { useColors, type, size, space } from '@/src/theme';

export default function TabLayout() {
  const c = useColors(); const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerStyle: { backgroundColor: c.canvas }, headerTitleStyle: type.title, headerTintColor: c.ink, headerShadowVisible: false, headerTitleAlign: 'left', headerRight: () => <IconButton icon={Settings} label="Settings" onPress={() => router.push('/settings')} />, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, height: size.tabBar + insets.bottom, paddingTop: space.xs, paddingBottom: Math.max(insets.bottom, space.sm) }, tabBarLabelStyle: type.navigation, tabBarHideOnKeyboard: true, sceneStyle: { backgroundColor: c.canvas } }}>
    <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ color, size }) => <House size={size} color={color} /> }} />
    <Tabs.Screen name="nearby" options={{ title: 'Nearby', tabBarIcon: ({ color, size }) => <Radar size={size} color={color} /> }} />
    <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: ({ color, size }) => <Search size={size} color={color} /> }} />
    <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: ({ color, size }) => <Bookmark size={size} color={color} /> }} />
  </Tabs>;
}
