import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, useColorScheme, useWindowDimensions, View } from 'react-native';
import { MapPin, Search, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SearchPlace } from '../types';
import { mapPlace, type Coordinate, type MapMessage } from '../services/map-selection';
import { useColors, space } from '../theme';
import { Button, Copy, Notice } from './ui';
import { LocationMap } from './location-map';

const STARTING_VIEW = { latitude: 52.5295, longitude: 13.401 };

export function MapLocationPicker({ initialPlace, radiusMeters, onCancel, onConfirm }: {
  initialPlace: Coordinate | null;
  radiusMeters: number;
  onCancel: () => void;
  onConfirm: (place: SearchPlace) => void;
}) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<Coordinate | null>(initialPlace);
  const [map, setMap] = useState(() => ({ center: initialPlace || STARTING_VIEW, selected: initialPlace, revision: 0 }));
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const confirming = useRef(false);
  const onEvent = useCallback((event: MapMessage) => {
    if (event.type === 'select') setDraft(event.coordinate);
    else if (event.type === 'ready') setReady(true);
    else if (event.type === 'tile-error') setMapError(true);
    else if (event.type === 'tiles-loaded') setMapError(false);
    else if (event.type === 'cancel') onCancel();
    else if (event.type === 'attribution') void Linking.openURL('https://www.openstreetmap.org/copyright');
  }, [onCancel]);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setMapError(true), 15000);
    return () => clearTimeout(timer);
  }, [ready, map.revision]);
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
    <View testID="map-location-picker" accessibilityViewIsModal onAccessibilityEscape={onCancel} style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.canvas }}>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Copy variant="heading" accessibilityRole="header" style={{ flex: 1 }}>Choose on map</Copy>
          <Button title="Cancel" variant="quiet" onPress={onCancel} />
        </View>
        <Copy variant="small" muted>Tap to place the pin. Drag or pinch to explore.</Copy>
      </View>
      <View style={{ flex: 1, minHeight: 100, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }}>
        <LocationMap key={map.revision} center={map.center} selected={map.selected} radiusMeters={radiusMeters} dark={dark} onEvent={onEvent} onError={() => setMapError(true)} />
        {!ready && !mapError && <View pointerEvents="none" style={{ position: 'absolute', top: space.lg, alignSelf: 'center', padding: space.md, gap: space.sm, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 12 }}><ActivityIndicator color={c.accent} /><Copy variant="small">Loading map…</Copy></View>}
      </View>
      <ScrollView style={{ maxHeight: Math.max(150, height * 0.42), flexGrow: 0 }} contentContainerStyle={{ padding: space.lg, paddingBottom: Math.max(insets.bottom, space.lg), gap: space.md }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <MapPin size={24} color={c.accent} />
          <View style={{ flex: 1, gap: space.xs }}>
            <Copy variant="heading">{draft ? 'Selected area' : 'Choose a search point'}</Copy>
            <Copy variant="small" muted>{radiusMeters >= 1000 ? radiusMeters / 1000 + ' km' : radiusMeters + ' m'} radius · Uses your current filters</Copy>
            {draft ? <Copy selectable variant="small" muted testID="map-coordinates" style={{ fontVariant: ['tabular-nums'] }}>{draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)}</Copy> : <Copy variant="small" muted>Starting view: Berlin. Explore anywhere.</Copy>}
          </View>
        </View>
        {mapError && <><Notice message="Map tiles could not load. Check your connection and retry, or cancel to search by name." /><Button title="Retry map" icon={RefreshCw} variant="secondary" onPress={() => { setReady(false); setMapError(false); setMap(previous => ({ center: draft || previous.center, selected: draft, revision: previous.revision + 1 })); }} /></>}
        <Button title="Search this area" icon={Search} disabled={!draft || !ready} onPress={() => { if (!draft || confirming.current) return; confirming.current = true; onConfirm(mapPlace(draft)); }} />
      </ScrollView>
    </View>
  </Modal>;
}
