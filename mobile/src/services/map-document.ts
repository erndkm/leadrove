import { leafletScript, leafletStyle } from '../vendor/leaflet';
import { validCoordinate, type Coordinate } from './map-selection';

export type MapDocumentOptions = {
  center: Coordinate;
  selected: Coordinate | null;
  radiusMeters: number;
  dark: boolean;
};

export function createMapDocument({ center, selected, radiusMeters, dark }: MapDocumentOptions): string {
  if (!validCoordinate(center) || (selected !== null && !validCoordinate(selected)))
    throw new RangeError('The map needs valid coordinates.');
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0)
    throw new RangeError('The map needs a valid search radius.');
  // Match the provider's supported radius; never interpolate caller-owned objects or labels.
  const config = JSON.stringify({
    center: { latitude: center.latitude, longitude: center.longitude },
    selected: selected ? { latitude: selected.latitude, longitude: selected.longitude } : null,
    radiusMeters: Math.max(200, Math.min(1500, radiusMeters)),
    dark: dark === true,
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const accent = dark ? '#b5d8cc' : '#204c46';
  const surface = dark ? '#222222' : '#ffffff';
  const ink = dark ? '#efefef' : '#27332e';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://tile.openstreetmap.org data:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>Choose a search location</title>
<style>${leafletStyle.replace(/<\/style/gi, '<\\/style')}
html,body,#map{width:100%;height:100%;margin:0}body{background:${dark ? '#1a1a1a' : '#eaf1ed'};color:${ink};font-family:system-ui,sans-serif}#map{background:${dark ? '#283d35' : '#eaf1ed'}}
#map:focus-visible{outline:3px solid ${accent};outline-offset:-4px}.leaflet-bar{border:1px solid ${dark ? '#65716a' : '#dfe5e0'}!important;box-shadow:0 2px 8px #0002!important}
.leaflet-touch .leaflet-bar a,.leaflet-bar a{width:48px;height:48px;line-height:48px;background:${surface};color:${ink};font-size:26px}.leaflet-bar a:hover,.leaflet-bar a:focus{background:${dark ? '#283d35' : '#eaf1ed'};color:${ink}}.leaflet-bar a:focus-visible,.leaflet-control-attribution a:focus-visible{outline:3px solid ${accent};outline-offset:-3px}.leaflet-bar a.leaflet-disabled{background:${surface};color:${dark ? '#a4afa8' : '#65716a'}}
.leaflet-control-attribution{max-width:calc(100vw - 24px);padding:5px 8px!important;font:11px/1.5 system-ui,sans-serif!important;background:${surface}!important;color:${ink}!important}.leaflet-control-attribution a{color:${accent};text-decoration:underline}
.leaflet-tile-pane{${dark ? 'filter:brightness(.7) saturate(.55)' : 'filter:saturate(.65)'}}.selected-pin{background:transparent;border:0}.pin-head{display:block;position:absolute;left:12px;top:4px;width:28px;height:28px;border:3px solid ${surface};border-radius:50% 50% 50% 0;background:${accent};transform:rotate(-45deg);box-shadow:0 2px 5px #0005}.pin-head:after{content:'';position:absolute;width:8px;height:8px;left:10px;top:10px;border-radius:50%;background:${surface}}
</style></head><body><div id="map" tabindex="0" role="region" aria-label="Choose a search location. Tap to place a pin. Use arrow keys to explore, plus and minus to zoom, Enter to select the map center, or Escape to cancel."></div>
<script>${leafletScript.replace(/<\/script/gi, '<\\/script')}</script>
<script>
(function(){
  'use strict';
  var config=${config};
  function send(payload){
    var message=JSON.stringify(payload);
    if(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==='function')window.ReactNativeWebView.postMessage(message);
    else if(window.parent!==window)window.parent.postMessage(message,'*');
  }
  var host=document.getElementById('map');
  var map=L.map(host,{zoomControl:false,attributionControl:true,minZoom:3,maxZoom:19,worldCopyJump:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false});
  map.attributionControl.setPrefix(false);
  var latitudeLimit=85.05112878;
  function visibleLatitude(latitude){return Math.max(-latitudeLimit,Math.min(latitudeLimit,latitude));}
  map.setView([visibleLatitude(config.center.latitude),config.center.longitude],13);
  L.control.zoom({position:'topright',zoomInTitle:'Zoom in',zoomOutTitle:'Zoom out'}).addTo(map);
  var failedTiles=new Set();
  var failedInBatch=false;
  var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,updateWhenIdle:true,keepBuffer:2,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  function visibleFailure(){
    var bounds=host.getBoundingClientRect();
    var visible=false;
    failedTiles.forEach(function(tile){
      if(!tile.isConnected){failedTiles.delete(tile);return;}
      var box=tile.getBoundingClientRect();
      if(box.right>bounds.left&&box.left<bounds.right&&box.bottom>bounds.top&&box.top<bounds.bottom)visible=true;
    });
    return visible;
  }
  function reportTiles(){
    if(visibleFailure()){
      if(!failedInBatch){failedInBatch=true;send({type:'tile-error'});}
    }else send({type:'tiles-loaded'});
  }
  tiles.on('loading',function(){failedInBatch=false;});
  tiles.on('tileerror',function(event){
    failedTiles.add(event.tile);
    if(!failedInBatch){failedInBatch=true;send({type:'tile-error'});}
  });
  tiles.on('tileload',function(event){failedTiles.delete(event.tile);});
  tiles.on('tileunload',function(event){failedTiles.delete(event.tile);});
  tiles.on('load',reportTiles);
  tiles.addTo(map);
  var marker=null;
  var circle=null;
  var pinIcon=L.divIcon({className:'selected-pin',html:'<span class="pin-head" aria-hidden="true"></span>',iconSize:[56,56],iconAnchor:[28,43]});
  function place(coordinate,notify){
    var point=[coordinate.latitude,coordinate.longitude];
    if(marker){marker.setLatLng(point);circle.setLatLng(point);}
    else{
      circle=L.circle(point,{radius:config.radiusMeters,color:'${accent}',weight:2,fillColor:'${accent}',fillOpacity:.12,interactive:false}).addTo(map);
      marker=L.marker(point,{icon:pinIcon,draggable:true,autoPan:true,keyboard:false,title:'Drag to move the search location'}).addTo(map);
      marker.on('dragend',function(){select(marker.getLatLng());});
    }
    if(notify)send({type:'select',coordinate:{latitude:coordinate.latitude,longitude:coordinate.longitude}});
  }
  function select(point){
    if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||Math.abs(point.lat)>90)return;
    var longitude=point.lng>=-180&&point.lng<=180?point.lng:((point.lng+180)%360+360)%360-180;
    place({latitude:point.lat,longitude:longitude},true);
  }
  if(config.selected){
    place(config.selected,false);
    var bounds=circle.getBounds();
    var south=visibleLatitude(bounds.getSouth()),north=visibleLatitude(bounds.getNorth());
    if(Number.isFinite(south)&&Number.isFinite(north)&&Number.isFinite(bounds.getWest())&&Number.isFinite(bounds.getEast()))
      map.fitBounds([[south,bounds.getWest()],[north,bounds.getEast()]],{padding:[35,35],maxZoom:16,animate:false});
  }
  map.on('click',function(event){select(event.latlng);});
  // Browsing never commits a selection; it only rechecks tile visibility.
  map.on('moveend',function(){if(!tiles.isLoading())reportTiles();});
  host.addEventListener('keydown',function(event){
    if(event.key==='Enter'&&event.target===host){event.preventDefault();event.stopPropagation();select(map.getCenter());}
  });
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();send({type:'cancel'});}
  });
  document.addEventListener('click',function(event){
    var link=event.target.closest&&event.target.closest('a');
    if(!link||!/^https?:/i.test(link.getAttribute('href')||''))return;
    event.preventDefault();event.stopPropagation();
    if(link.getAttribute('href')==='https://www.openstreetmap.org/copyright')send({type:'attribution'});
  },true);
  window.addEventListener('resize',function(){map.invalidateSize({animate:false,pan:false});});
  send({type:'ready'});
})();
</script></body></html>`;
}
