const selectors = [
  '[shop][shop!~"^(vacant|no)$"]',
  '[craft]',
  '[office]',
  '[amenity~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|dentist|doctors|clinic|pharmacy|veterinary|car_rental|car_wash|driving_school)$"]',
  '[healthcare]',
  '[leisure=fitness_centre]',
  '[tourism~"^(hotel|guest_house|hostel|motel)$"]',
];

export function buildBusinessQuery(center, radius) {
  const lat = Number(center?.lat), lng = Number(center?.lng), size = Number(radius);
  if (![lat, lng, size].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || size < 0.5 || size > 10) {
    throw new Error('Choose a valid location and a radius between 0.5 and 10 km.');
  }

  const memory = size <= 3 ? 67108864 : 134217728;
  const latDelta = size / 110;
  const south = Math.max(-90, lat - latDelta), north = Math.min(90, lat + latDelta);
  const poleward = Math.max(Math.abs(south), Math.abs(north));
  const longitudeScale = Math.cos(poleward * Math.PI / 180);
  const lngDelta = longitudeScale > 0.05 ? size / (110 * longitudeScale) : Infinity;
  if (lng - lngDelta < -180 || lng + lngDelta > 180) {
    const around = `(around:${Math.round(size * 1000)},${lat},${lng})`;
    return `[out:json][timeout:25][maxsize:${memory}];(${selectors.map(selector => `nwr${selector}[name]${around};`).join('')});out center tags;`;
  }

  // A bounding box is much faster for Overpass. normalizeBusinesses applies the exact circle afterward.
  const outward = (value, direction) => (direction === 'low' ? Math.floor(value * 1e6) : Math.ceil(value * 1e6)) / 1e6;
  const bbox = [outward(south, 'low'), outward(lng - lngDelta, 'low'), outward(north, 'high'), outward(lng + lngDelta, 'high')].join(',');
  return `[out:json][timeout:25][maxsize:${memory}][bbox:${bbox}];(${selectors.map(selector => `nwr${selector}[name];`).join('')});out center tags;`;
}
