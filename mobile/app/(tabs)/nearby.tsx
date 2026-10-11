import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Radar, RefreshCw } from 'lucide-react-native';
import { useLeadrove } from '@/src/store/use-leadrove';
import { Button, Choices, Copy, Empty, Loading, Notice } from '@/src/components/ui';
import { BusinessRow } from '@/src/components/business-row';
import { DiscoveryControl } from '@/src/components/discovery-control';
import { useColors, size, space } from '@/src/theme';

export default function NearbyScreen() {
  const { leads, hydrated, scanNow, searching, error, session } = useLeadrove();
  const c = useColors(); const [period, setPeriod] = useState<'today' | 'week'>('today');
  const start = new Date(); start.setHours(0, 0, 0, 0); if (period === 'week') start.setDate(start.getDate() - 6);
  const visible = leads.filter(lead => lead.seenCount > 0 && lead.firstSeenAt >= start.getTime() && !lead.dismissed).sort((a, b) => b.firstSeenAt - a.firstSeenAt);
  return <FlatList data={hydrated ? visible : []} keyExtractor={item => `${item.id}-${item.dayKey}`} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: c.canvas }} contentContainerStyle={{ padding: space.xl, paddingBottom: space.huge, maxWidth: size.content, width: '100%', alignSelf: 'center' }} renderItem={({ item }) => <BusinessRow business={item} seen />} ListHeaderComponent={<View style={{ gap: space.xl, paddingBottom: space.md }}><DiscoveryControl /><Choices values={[{ label: 'Today', value: 'today' }, { label: 'Last 7 days', value: 'week' }]} value={period} onChange={setPeriod} /><View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}><Copy variant="heading" style={{ flex: 1 }}>{visible.length} {visible.length === 1 ? 'encounter' : 'encounters'}</Copy>{session.enabled && <Button title="Check now" icon={RefreshCw} variant="quiet" loading={searching} onPress={scanNow} />}</View><Notice message={error && error !== session.error ? error : null} /></View>} ListEmptyComponent={!hydrated ? <Loading /> : <Empty icon={Radar} title={period === 'today' ? 'A fresh day ahead' : 'No encounters this week'} message="Businesses you pass while discovery is on will appear here." />} />;
}
