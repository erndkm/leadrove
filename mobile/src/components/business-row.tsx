import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Bookmark } from 'lucide-react-native';
import type { Business, NearbyLead } from '@/src/types';
import { Copy } from './ui';
import { useColors, space, radius, size } from '@/src/theme';

export function BusinessRow({ business, seen }: { business: Business | NearbyLead; seen?: boolean }) {
  const c = useColors();
  const distance = business.distanceMeters >= 1000 ? `${(business.distanceMeters / 1000).toFixed(1)} km` : `${Math.round(business.distanceMeters)} m`;
  const websiteStatus = business.websiteStatus === 'missing' ? 'No website listed' : business.websiteStatus === 'social' ? 'Social page only' : 'Website listed';
  const encounterTime = seen && 'firstSeenAt' in business ? new Date(business.firstSeenAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  const isSaved = 'saved' in business && business.saved;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${business.name}, ${business.kind}, ${distance}. ${websiteStatus}. Opportunity score ${business.score}.${isSaved ? ' Saved.' : ''}${encounterTime ? ` Encountered ${encounterTime}.` : ''} Open details`} onPress={() => router.push({ pathname: '/business/[id]', params: { id: business.id } })} style={({ pressed }) => ({ paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.55 : 1 })}>
    <View style={{ flex: 1, gap: space.xs }}><Copy variant="heading">{business.name}</Copy><Copy muted variant="small">{business.kind} · {distance}</Copy><Copy variant="small" style={{ color: c.accent }}>{websiteStatus}</Copy>{encounterTime && <Copy variant="small" muted>{encounterTime}</Copy>}</View>
    {isSaved && <Bookmark size={16} color={c.accent} fill={c.accent} />}<View style={{ backgroundColor: c.tint, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm }}><Copy variant="label" style={{ color: c.accent, fontVariant: ['tabular-nums'] }}>{business.score}</Copy></View><ChevronRight size={size.icon} color={c.muted} />
  </Pressable>;
}
