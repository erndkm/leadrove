import { useEffect, useMemo, useRef } from 'react';
import { createMapDocument } from '../services/map-document';
import { readMapMessage } from '../services/map-selection';
import type { LocationMapProps } from './location-map.types';

// The browser preview shares the local map document with the native WebView.
export function LocationMap({ center, selected, radiusMeters, dark, onEvent, onError }: LocationMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => createMapDocument({ center, selected, radiusMeters, dark }), [center, selected, radiusMeters, dark]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = readMapMessage(event.data);
      if (message) onEvent(message);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onEvent]);
  return <iframe
    ref={frame}
    title="Search area map"
    srcDoc={html}
    // Only bundled, trusted code runs here. Same-origin preserves the tile Referer.
    sandbox="allow-scripts allow-same-origin"
    referrerPolicy="strict-origin-when-cross-origin"
    onError={onError}
    style={{ border: 0, display: 'block', flex: 1, width: '100%', height: '100%', background: dark ? '#222222' : '#eaf1ed' }}
  />;
}
