import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, TextInput, View } from 'react-native';
import { ChevronRight, Clock3, LocateFixed, Map, MapPin, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useLeadrove } from '@/src/store/use-leadrove';
import type { SearchPlace } from '@/src/types';
import { Button, Copy, Empty, Notice } from '@/src/components/ui';
import { BusinessRow } from '@/src/components/business-row';
import { MapLocationPicker } from '@/src/components/map-location-picker';
import { validCoordinate } from '@/src/services/map-selection';
import { useColors, space, type, radius, size } from '@/src/theme';

type PlaceStatus = 'idle' | 'loading' | 'ready' | 'error';

export default function DiscoverScreen() {
  const {
    discoverResults, recentPlaces, searchNearby, searchArea, searchLocations,
    searching, error, clearError, settings, session,
  } = useLeadrove();
  const c = useColors();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<SearchPlace[]>([]);
  const [placeStatus, setPlaceStatus] = useState<PlaceStatus>('idle');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [searchVersion, setSearchVersion] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [area, setArea] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SearchPlace | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const placeRequest = useRef<AbortController | null>(null);
  const immediateRequest = useRef(false);
  const input = useRef<TextInput>(null);
  const text = query.trim();

  useEffect(() => {
    placeRequest.current?.abort();
    if (!showSuggestions || text.length < 2) {
      setPlaceStatus('idle');
      setPlaces([]);
      return;
    }
    const controller = new AbortController();
    placeRequest.current = controller;
    setPlaceStatus('loading');
    setLocalError(null);
    setPlaces([]);
    const delay = immediateRequest.current ? 0 : 350;
    immediateRequest.current = false;
    const timer = setTimeout(async () => {
      try {
        const matches = await searchLocations(text, { signal: controller.signal });
        if (controller.signal.aborted || placeRequest.current !== controller) return;
        setPlaces(matches);
        setPlaceStatus('ready');
      } catch (e) {
        if (controller.signal.aborted || placeRequest.current !== controller) return;
        setLocalError(e instanceof Error ? e.message : 'Could not find this place. Try again.');
        setPlaceStatus('error');
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (placeRequest.current === controller) placeRequest.current = null;
    };
  }, [query, text, searchVersion, showSuggestions, searchLocations]);

  function editQuery(value: string) {
    // Cancel synchronously so a response cannot land between typing and effect cleanup.
    placeRequest.current?.abort();
    setQuery(value);
    setPlaces([]);
    setLocalError(null);
    setPlaceStatus(value.trim().length >= 2 ? 'loading' : 'idle');
    setShowSuggestions(true);
  }

  function findPlaces() {
    if (text.length < 2) return;
    placeRequest.current?.abort();
    immediateRequest.current = true;
    setShowSuggestions(true);
    setSearchVersion((version) => version + 1);
    clearError();
    Keyboard.dismiss();
  }

  async function choose(place: SearchPlace) {
    placeRequest.current?.abort();
    Keyboard.dismiss();
    setShowSuggestions(false);
    setPlaces([]);
    setPlaceStatus('idle');
    setQuery(place.id?.startsWith('map:') ? '' : place.name || place.label);
    setSelectedPlace(place);
    setArea(place.label);
    setSearched(true);
    setLocalError(null);
    try { await searchArea(place); }
    catch (e) { setLocalError(e instanceof Error ? e.message : 'Search failed. Please try again.'); }
  }

  const showingRecent = showSuggestions && !text && recentPlaces.length > 0;
  const visiblePlaces = showingRecent ? recentPlaces.slice(0, 3) : showSuggestions ? places : [];
  const mapStart = [selectedPlace, recentPlaces[0], session.lastLocation].find(validCoordinate) || null;

  return (
    <><FlatList
      data={discoverResults}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: c.canvas }}
      contentContainerStyle={{ padding: space.xl, paddingBottom: space.huge, maxWidth: size.content, width: '100%', alignSelf: 'center' }}
      renderItem={({ item }) => <BusinessRow business={item} />}
      ListHeaderComponent={(
        <View style={{ gap: space.lg, paddingBottom: space.md }}>
          <Copy muted>Find businesses worth a conversation.</Copy>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingLeft: space.lg, paddingRight: space.xs, backgroundColor: c.surface }}>
              <MapPin size={size.icon} color={c.muted} />
              <TextInput
                ref={input}
                accessibilityLabel="City or neighborhood"
                accessibilityHint="Type at least two characters, then choose an area from the suggestions."
                placeholder="City or neighborhood"
                placeholderTextColor={c.muted}
                value={query}
                onChangeText={editQuery}
                onFocus={() => setShowSuggestions(true)}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="words"
                maxLength={120}
                onSubmitEditing={findPlaces}
                style={{ ...type.body, flex: 1, minHeight: size.control, color: c.ink }}
              />
              {!!query && (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear area search" onPress={() => { editQuery(''); input.current?.focus(); }} style={({ pressed }) => ({ minHeight: size.control, minWidth: size.control, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
                  <X size={size.icon} color={c.muted} />
                </Pressable>
              )}
            </View>
            {showSuggestions && text.length === 1 && <Copy variant="small" muted>Type one more character to find an area.</Copy>}
            {showSuggestions && placeStatus === 'loading' && (
              <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
                <ActivityIndicator size="small" color={c.accent} />
                <Copy variant="small" muted>Finding matching areas…</Copy>
              </View>
            )}
            {visiblePlaces.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.md, backgroundColor: c.surface, overflow: 'hidden' }}>
                <Copy variant="label" muted style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs }}>{showingRecent ? 'Recent areas' : 'Suggested areas'}</Copy>
                {visiblePlaces.map((place, index) => {
                  const name = place.name || place.label.split(',')[0];
                  const detail = place.label.startsWith(name + ', ') ? place.label.slice(name.length + 2) : place.label === name ? '' : place.label;
                  const Icon = showingRecent ? Clock3 : MapPin;
                  return (
                    <Pressable
                      key={place.id || place.latitude + '-' + place.longitude + '-' + place.label}
                      accessibilityRole="button"
                      accessibilityLabel={'Search businesses in ' + place.label}
                      accessibilityState={{ disabled: searching }}
                      disabled={searching}
                      onPress={() => { void choose(place); }}
                      style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, alignItems: 'center', minHeight: size.control, padding: space.lg, borderTopWidth: index ? 1 : 0, borderTopColor: c.line, backgroundColor: pressed ? c.tint : c.surface, opacity: searching ? 0.5 : 1 })}
                    >
                      <Icon size={size.icon} color={c.accent} />
                      <View style={{ flex: 1, gap: space.xs }}>
                        <Copy variant="heading">{name}</Copy>
                        {!!detail && <Copy variant="small" muted>{detail}</Copy>}
                      </View>
                      <ChevronRight size={size.icon} color={c.muted} />
                    </Pressable>
                  );
                })}
              </View>
            )}
            {showSuggestions && placeStatus === 'ready' && !places.length && (
              <Copy accessibilityLiveRegion="polite" variant="small" muted>No matching area. Add a region or country, or try another spelling.</Copy>
            )}
            {showSuggestions && placeStatus === 'error' && <Button title="Try place search again" icon={Search} variant="quiet" onPress={findPlaces} />}
          </View>
          <Button title="Find area" icon={Search} onPress={findPlaces} loading={placeStatus === 'loading'} disabled={text.length < 2 || searching} />
          <Button title="Choose on map" icon={Map} variant="secondary" disabled={searching} onPress={() => {
            placeRequest.current?.abort();
            Keyboard.dismiss();
            setShowSuggestions(false);
            setPlaces([]);
            setPlaceStatus('idle');
            setMapOpen(true);
          }} />
          <Button title="Use my location" icon={LocateFixed} variant="secondary" loading={searching} onPress={async () => {
            placeRequest.current?.abort();
            Keyboard.dismiss();
            setShowSuggestions(false);
            setPlaces([]);
            setPlaceStatus('idle');
            setArea('Around you');
            setSearched(true);
            setLocalError(null);
            await searchNearby();
          }} />
          <Notice message={localError || error} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Copy variant="heading">{searched ? discoverResults.length + ' businesses' : 'Search locally'}</Copy>
              <Copy variant="small" muted>{settings.radiusMeters >= 1000 ? settings.radiusMeters / 1000 + ' km' : settings.radiusMeters + ' m'} radius · Score {settings.minScore}+</Copy>
            </View>
            <Button title="Filters" icon={SlidersHorizontal} variant="quiet" onPress={() => router.push('/settings')} />
          </View>
          {!!area && <Copy variant="small" muted>{area}</Copy>}
        </View>
      )}
      ListEmptyComponent={searching ? <View style={{ paddingVertical: space.xl }}><Copy muted>Checking public map listings…</Copy></View> : <Empty icon={Search} title={searched ? 'No businesses to show' : 'Choose your next area'} message={searched ? 'Try a nearby area or broaden your filters.' : 'Choose a point on the map, search by name, or use your location.'} />}
      ListFooterComponent={discoverResults.length > 0 ? <Copy variant="small" muted style={{ paddingTop: space.xl }}>OpenStreetMap listings may be incomplete. Scores are unverified signals, not ratings.</Copy> : null}
    />{mapOpen && <MapLocationPicker initialPlace={mapStart} radiusMeters={settings.radiusMeters} onCancel={() => setMapOpen(false)} onConfirm={place => { setMapOpen(false); void choose(place); }} />}</>
  );
}
