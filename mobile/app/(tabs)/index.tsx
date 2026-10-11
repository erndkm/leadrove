import { View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUpRight, Radar } from 'lucide-react-native';
import { useLeadrove } from '@/src/store/use-leadrove';
import { Screen, Copy, Button, Section, Empty, Loading } from '@/src/components/ui';
import { BusinessRow } from '@/src/components/business-row';
import { DiscoveryControl } from '@/src/components/discovery-control';
import { useColors, space } from '@/src/theme';

export default function TodayScreen() {
  const { leads, hydrated } = useLeadrove(); const c = useColors();
  const today = new Date().toLocaleDateString('en-CA');
  const found = leads.filter(lead => lead.seenCount > 0 && new Date(lead.firstSeenAt).toLocaleDateString('en-CA') === today && !lead.dismissed);
  const saved = [...new Map(leads.filter(lead => lead.saved && !lead.dismissed).map(lead => [lead.id, lead])).values()];
  return <Screen>
    <Copy variant="small" muted>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Copy>
    {!hydrated ? <Loading /> : <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xl, paddingBottom: space.sm }}>
      <View style={{ flex: 1, gap: space.xs }}><Copy variant="hero" selectable>{found.length}</Copy><Copy muted>Businesses found today</Copy></View>
      <Button title={`${saved.length} saved`} variant="quiet" onPress={() => router.push('/saved')} />
    </View>}
    <DiscoveryControl compact />
    {hydrated && <Section title="Today's discoveries" trailing={found.length ? <Button title="View all" variant="quiet" icon={ArrowUpRight} onPress={() => router.push('/nearby')} /> : undefined}>
      {found.length ? <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>{found.slice(0, 3).map(lead => <BusinessRow key={lead.id} business={lead} />)}</View> : <Empty icon={Radar} title="Nothing found yet" message="Start discovery or search an area to find businesses." action="Search an area" onAction={() => router.push('/discover')} />}
    </Section>}
  </Screen>;
}
