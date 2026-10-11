// Reject malformed percent encodings before the router's legacy query decoder.
// Keep the original encoding so business IDs such as node%2F42 still round-trip.
export function safeIncomingPath(path: string): string {
  if (typeof path !== 'string' || path.length > 4096 || /[\u0000-\u001f\u007f]/.test(path)) return '/';
  try { decodeURIComponent(path); } catch { return '/'; }
  return path;
}
