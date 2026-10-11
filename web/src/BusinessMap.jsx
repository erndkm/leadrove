import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(workerUrl);

const mapStyle = import.meta.env.VITE_MAP_STYLE_URL?.trim() || 'https://tiles.openfreemap.org/styles/liberty';
const tileUrl = import.meta.env.VITE_TILE_URL?.trim();
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export default function BusinessMap({ center, radius, businesses, selectedId, onSelect, onMove, fitToken, confirming }) {
  const host = useRef(null), map = useRef(null), layer = useRef(null), area = useRef(null), origin = useRef(null), markerRefs = useRef(new Map());
  const pendingFit = useRef(true);
  const fitting = useRef(false);
  const previousRadius = useRef(radius);
  const fitOptions = useRef(null);
  fitOptions.current = { paddingTopLeft: [30, confirming ? 135 : 85], paddingBottomRight: [30, 60], animate: false };
  const callbacks = useRef({ onSelect, onMove });
  callbacks.current = { onSelect, onMove };
  function fitArea(m) {
    fitting.current = true;
    m.fitBounds(area.current.getBounds().pad(0.15), fitOptions.current);
    const c = m.getCenter(); callbacks.current.onMove({ lat: c.lat, lng: c.lng, browsed: false });
    fitting.current = false;
  }
  useEffect(() => {
    const m = L.map(host.current, { zoomControl: false, attributionControl: false, preferCanvas: true, minZoom: 3, maxZoom: 19, zoomSnap: 0.25 }).setView([center.lat, center.lng], 14);
    map.current = m;
    m.createPane('scan-area'); m.getPane('scan-area').style.zIndex = '450'; m.getPane('scan-area').style.pointerEvents = 'none';
    const renderer = L.svg({ pane: 'scan-area' });
    area.current = L.circle([center.lat, center.lng], { renderer, radius: radius * 1000, className: 'scan-boundary', weight: 2.5, dashArray: '7 5', fillOpacity: 0.08, interactive: false }).addTo(m);
    origin.current = L.circleMarker([center.lat, center.lng], { renderer, radius: 5, className: 'scan-origin', weight: 2, fillOpacity: 1, interactive: false }).addTo(m);
    const attribution = L.control.attribution({ prefix: false }).addTo(m);
    if (tileUrl) {
      L.tileLayer(tileUrl, { maxZoom: 19, attribution: import.meta.env.VITE_TILE_ATTRIBUTION?.trim() || osmAttribution }).addTo(m);
    } else {
      attribution.addAttribution('<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · ' + osmAttribution);
      maplibreGL({ style: mapStyle, attributionControl: false }).addTo(m);
    }
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(m);
    layer.current = L.markerClusterGroup({
      maxClusterRadius: 43, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
      animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        const node = document.createElement('span'); node.className = 'cluster-count';
        node.textContent = count; node.setAttribute('aria-label', `${count} nearby businesses. Zoom in to explore.`);
        return L.divIcon({ html: node, className: 'cluster-shell', iconSize: [44, 44] });
      }
    }).addTo(m);
    // The viewport is independent of the search center. Only an explicit preview relocates the circle.
    m.on('moveend', () => { if (fitting.current) return; const c = m.getCenter(); callbacks.current.onMove({ lat: c.lat, lng: c.lng, browsed: true }); });
    const observer = new ResizeObserver(() => {
      if (!host.current?.clientWidth || !host.current?.clientHeight) return;
      fitting.current = true; m.invalidateSize(); fitting.current = false;
      if (pendingFit.current && area.current) {
        fitArea(m);
        pendingFit.current = false;
      }
    }); observer.observe(host.current);
    return () => { observer.disconnect(); m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current;
    area.current.setLatLng([center.lat, center.lng]).setRadius(radius * 1000);
    origin.current.setLatLng([center.lat, center.lng]);
    // Keep a stable scale while resizing; zoom out only when the larger circle needs room.
    const expanded = radius > previousRadius.current;
    previousRadius.current = radius;
    if (!host.current?.clientWidth || !host.current?.clientHeight) { pendingFit.current = true; return; }
    if (expanded && !m.getBounds().pad(-0.12).contains(area.current.getBounds())) {
      fitArea(m);
    }
  }, [center.lat, center.lng, radius]);
  useEffect(() => {
    const m = map.current;
    pendingFit.current = true;
    if (host.current?.clientWidth && host.current?.clientHeight) {
      fitting.current = true; m.invalidateSize(); fitting.current = false;
      fitArea(m);
      pendingFit.current = false;
    }
  }, [fitToken]);
  useEffect(() => {
    layer.current.clearLayers(); markerRefs.current.clear();
    const markers = [];
    businesses.forEach((b, index) => {
      const pin = document.createElement('button'); pin.type = 'button'; pin.className = `map-pin ${b.score >= 70 ? 'high' : b.score >= 45 ? 'medium' : 'low'}`; pin.textContent = index + 1; pin.setAttribute('aria-label', `${index + 1}. ${b.name}, priority ${b.score}`);
      const icon = L.divIcon({ html: pin, className: 'marker-shell', iconSize: [34, 38], iconAnchor: [17, 38] });
      const marker = L.marker([b.lat, b.lng], { icon, keyboard: false, zIndexOffset: b.score });
      markers.push(marker);
      pin.addEventListener('click', () => callbacks.current.onSelect(b.id));
      const tooltip = document.createElement('span'); tooltip.textContent = b.name;
      marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -30] });
      markerRefs.current.set(b.id, { marker, pin });
    });
    layer.current.addLayers(markers);
  }, [businesses]);
  useEffect(() => {
    markerRefs.current.forEach(({ marker, pin }, id) => { pin.classList.toggle('selected', selectedId === id); pin.setAttribute('aria-pressed', String(selectedId === id)); marker.setZIndexOffset(selectedId === id ? 10000 : 0); });
    const target = markerRefs.current.get(selectedId);
    if (target) layer.current.zoomToShowLayer(target.marker, () => {
      const m = map.current;
      if (!m) return;
      const point = m.latLngToContainerPoint(target.marker.getLatLng());
      if (point.x > m.getSize().x - 365) m.panBy([Math.min(175, m.getSize().x / 3), 0], { animate: false });
    });
  }, [selectedId, businesses]);
  return <div ref={host} className="map-canvas" aria-label="Business locations. Use arrow keys to explore, or select a numbered marker for details." />;
}
