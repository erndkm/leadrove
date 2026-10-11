import { Linking, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Radar, Pause, ArrowUpRight } from 'lucide-react-native';
import { useLeadrove } from '@/src/store/use-leadrove';
import { Button, Copy, Notice } from './ui';
import { useColors, space, radius } from '@/src/theme';

export function DiscoveryControl({ compact = false }: { compact?: boolean }) {
  const { session, startDiscovery, pauseDiscovery, locationPermission, notificationPermission, settings, updateSettings } = useLeadrove();
  const c = useColors();
  const active = session.enabled;
  const status = active ? session.mode === 'background' ? 'Discovering as you go' : 'Discovering while open' : 'Discovery is paused';
  return <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, borderCurve: 'continuous', padding: space.xl, gap: space.lg, borderWidth: 1, borderColor: c.line }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}><Radar color={c.accent} size={26} /><View style={{ flex: 1, gap: space.xs }}><Copy variant="heading">{status}</Copy><Copy variant="small" muted>{active ? session.mode === 'background' ? 'Background location is on' : 'Keep Leadrove open to find leads' : 'Find local businesses on your day out'}</Copy></View></View>
    {!active && <Copy muted variant={compact ? 'small' : 'body'}>Search areas are shared with map providers. Encounters stay on this phone; no route history. Starting requests location access.</Copy>}
    <Button key={active ? 'pause' : 'start'} title={active ? 'Pause discovery' : 'Start discovery'} icon={active ? Pause : Radar} variant={active ? 'secondary' : 'primary'} onPress={active ? pauseDiscovery : startDiscovery} />
    {active && session.endsAt && <Copy variant="small" muted>Session expires at {new Date(session.endsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · Pause anytime</Copy>}
    {compact && !active && <Button title="How discovery works" variant="quiet" icon={ArrowUpRight} onPress={() => router.push('/nearby')} />}
    {!compact && <><Copy variant="small" muted>{session.lastScanAt ? `Last checked ${new Date(session.lastScanAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'No area checked yet'}</Copy><View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}><Copy style={{ flex: 1 }}>Notify me about new leads</Copy><Switch accessibilityLabel="Notify me about new leads" value={settings.notificationsEnabled} onValueChange={value => { void updateSettings({ notificationsEnabled: value }); }} trackColor={{ true: c.accent, false: c.line }} /></View></>}
    <Notice message={session.error} />{locationPermission === 'denied' && <Button title="Open location settings" variant="secondary" onPress={() => Linking.openSettings()} />}{!compact && notificationPermission === 'denied' && <><Copy muted variant="small">Notifications are off in device settings. Your discoveries still appear here.</Copy><Button title="Open notification settings" variant="quiet" onPress={() => Linking.openSettings()} /></>}
  </View>;
}
