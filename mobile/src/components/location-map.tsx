import { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import { createMapDocument } from '../services/map-document';
import { readMapMessage } from '../services/map-selection';
import type { LocationMapProps } from './location-map.types';

export function LocationMap({ center, selected, radiusMeters, dark, onEvent, onError }: LocationMapProps) {
  const html = useMemo(() => createMapDocument({ center, selected, radiusMeters, dark }), [center, selected, radiusMeters, dark]);
  return <WebView
    style={{ flex: 1, backgroundColor: dark ? '#222222' : '#eaf1ed' }}
    source={{ html }}
    originWhitelist={['*']}
    applicationNameForUserAgent="Leadrove/1.0 (app.leadrove.mobile)"
    javaScriptEnabled
    domStorageEnabled={false}
    geolocationEnabled={false}
    allowFileAccess={false}
    allowFileAccessFromFileURLs={false}
    allowUniversalAccessFromFileURLs={false}
    mixedContentMode="never"
    sharedCookiesEnabled={false}
    thirdPartyCookiesEnabled={false}
    setSupportMultipleWindows={false}
    javaScriptCanOpenWindowsAutomatically={false}
    showsVerticalScrollIndicator={false}
    showsHorizontalScrollIndicator={false}
    scrollEnabled={false}
    onShouldStartLoadWithRequest={({ url }) => url === 'about:blank' || url.startsWith('about:blank#')}
    onMessage={({ nativeEvent }) => { const event = readMapMessage(nativeEvent.data); if (event) onEvent(event); }}
    onError={onError}
    onContentProcessDidTerminate={onError}
    onRenderProcessGone={onError}
    accessibilityLabel="Search area map"
  />;
}
