import { useEffect, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Bookmark, Check, ExternalLink, MapPin, Phone, Mail, X } from 'lucide-react-native';
import { externalLink, phoneLink } from '@/src/services/external-links';
import { useLeadrove } from '@/src/store/use-leadrove';
import { Button, Copy, Empty, Loading, Screen, Section } from '@/src/components/ui';
import { useColors, space, type, radius } from '@/src/theme';

async function openLink(raw: string, protocols: string[]) { await Linking.openURL(externalLink(raw, protocols)); }
export default function BusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { leads, discoverResults, hydrated, toggleSaved, updateNotes, dismissLead } = useLeadrove();
  const persisted = leads.filter(item => item.id === id).sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0];
  const business = persisted || discoverResults.find(item => item.id === id);
  const [notes, setNotes] = useState(persisted?.notes || ''); const [notesSaved, setNotesSaved] = useState(false); const c = useColors();
  useEffect(() => { setNotes(persisted?.notes || ''); }, [persisted?.notes]);
  if (!hydrated) return <Screen><Loading /></Screen>;
  if (!business) return <Screen><Empty icon={MapPin} title="Business unavailable" message="This listing is no longer in your local results." action="Find businesses" onAction={() => router.replace('/discover')} /></Screen>;
  const saved = persisted?.saved || false;
  return <Screen automaticallyAdjustKeyboardInsets><Stack.Screen options={{ title: 'Business details' }} /><View style={{ gap: space.sm }}><Copy variant="small" muted>{business.kind}</Copy><Copy variant="hero" selectable>{business.name}</Copy>{!!business.address && <Copy selectable muted>{business.address}</Copy>}</View><Button title={saved ? 'Saved to your leads' : 'Save lead'} icon={saved ? Check : Bookmark} variant={saved ? 'secondary' : 'primary'} onPress={() => toggleSaved(business)} />
    <Section title="Opportunity"><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}><Copy selectable variant="hero" style={{ color: c.accent }}>{business.score}</Copy><Copy muted>/ 100</Copy></View>{business.reasons.map((reason, index) => <View key={`${reason}-${index}`} style={{ flexDirection: 'row', gap: space.sm }}><Check color={c.accent} size={20} /><Copy style={{ flex: 1 }}>{reason}</Copy></View>)}<Copy variant="small" muted>Heuristic from public listing data. Verify the business and its online presence before reaching out.</Copy></Section>
    <Section title="Contact & location">{business.phone ? <Button title={business.phone} icon={Phone} variant="secondary" onPress={() => openLink(phoneLink(business.phone), ['tel:'])} /> : <Copy muted variant="small">No phone number listed</Copy>}{business.email ? <Button title={business.email} icon={Mail} variant="secondary" onPress={() => openLink(`mailto:${encodeURIComponent(business.email)}`, ['mailto:'])} /> : null}{business.website ? <Button title={business.websiteStatus === 'social' ? 'Open social page' : 'Open website'} icon={ExternalLink} variant="secondary" onPress={() => openLink(/^https?:\/\//i.test(business.website) ? business.website : `https://${business.website}`, ['http:', 'https:'])} /> : <Copy muted variant="small">{business.websiteStatus === 'missing' ? 'No website listed' : 'Website address needs verification'}</Copy>}<Button title="View on map" icon={MapPin} variant="secondary" onPress={() => openLink(`https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}`, ['https:'])} />{!!business.sourceUrl && <Button title="Open source listing" icon={ExternalLink} variant="quiet" onPress={() => openLink(business.sourceUrl, ['https:', 'http:'])} />}</Section>
    <Section title="Your notes"><TextInput accessibilityLabel="Notes about this business" multiline maxLength={10000} textAlignVertical="top" value={notes} onChangeText={value => { setNotes(value); setNotesSaved(false); }} placeholder="A contact name, an idea, a next step…" placeholderTextColor={c.muted} style={{ ...type.body, color: c.ink, minHeight: 144, padding: space.lg, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.md }} /><Button title={notesSaved ? 'Notes saved' : 'Save notes'} icon={notesSaved ? Check : undefined} variant="secondary" onPress={async () => { if (!saved) await toggleSaved(business); await updateNotes(business.id, notes); setNotesSaved(true); }} /></Section>
    {persisted && <Button title="Dismiss lead" icon={X} variant="quiet" onPress={async () => { await dismissLead(business.id); router.back(); }} />}
  </Screen>;
}
