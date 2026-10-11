import { useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { Bookmark, Search } from 'lucide-react-native';
import { router } from 'expo-router';
import { useLeadrove } from '@/src/store/use-leadrove';
import { Copy, Empty, Loading } from '@/src/components/ui';
import { BusinessRow } from '@/src/components/business-row';
import { useColors, space, type, radius, size } from '@/src/theme';

export default function SavedScreen() {
  const { leads, hydrated } = useLeadrove(); const [query, setQuery] = useState(''); const c = useColors();
  const saved = [...new Map(leads.filter(lead => lead.saved && !lead.dismissed).map(lead => [lead.id, lead])).values()];
  const visible = saved.filter(lead => `${lead.name} ${lead.kind} ${lead.notes}`.toLowerCase().includes(query.toLowerCase()));
  return <FlatList data={hydrated ? visible : []} keyExtractor={item => item.id} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: c.canvas }} contentContainerStyle={{ padding: space.xl, paddingBottom: space.huge, maxWidth: size.content, width: '100%', alignSelf: 'center' }} renderItem={({ item }) => <BusinessRow business={item} />} ListHeaderComponent={<View style={{ gap: space.lg, paddingBottom: space.md }}><Copy muted>Your shortlist, ready for the next step.</Copy>{saved.length > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}><Search size={size.icon} color={c.muted} /><TextInput accessibilityLabel="Search saved leads" placeholder="Search your leads" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} clearButtonMode="while-editing" style={{ ...type.body, flex: 1, minHeight: size.control, color: c.ink }} /></View>}<Copy variant="label" muted>{saved.length} saved {saved.length === 1 ? 'lead' : 'leads'}</Copy></View>} ListEmptyComponent={!hydrated ? <Loading /> : <Empty icon={Bookmark} title={query ? 'No matching leads' : 'Keep the promising ones'} message={query ? 'Try another name, category, or note.' : 'Save businesses from Discover or Nearby to build your shortlist.'} action={query ? 'Clear search' : 'Find businesses'} onAction={() => query ? setQuery('') : router.push('/discover')} />} />;
}
