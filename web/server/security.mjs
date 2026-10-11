import { isIP } from 'node:net';

export const CLIENT_HEADER = 'x-leadrove-client';
export const httpError = (status, message) => Object.assign(new Error(message), { status });
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const localAddress = address => address === '::1' || address === '::ffff:127.0.0.1' || (isIP(address || '') === 4 && address.startsWith('127.'));

export function localRequestOrigin(request) {
  const host = request.headers.host;
  if (!localAddress(request.socket?.remoteAddress) || typeof host !== 'string' || /[\s/@\\%?#]/.test(host)) throw httpError(403, 'Open Leadrove on this computer using its localhost address.');
  let url;
  try { url = new URL(`http://${host}`); } catch { throw httpError(403, 'Invalid local host.'); }
  if (!localHosts.has(url.hostname) || (url.port || '80') !== String(request.socket.localPort)) throw httpError(403, 'This host is not allowed.');
  return url.origin;
}

export function configuredOrigin(raw) {
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error('CLIENTFINDER_ALLOWED_ORIGIN must be an exact HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.origin !== raw || url.username || url.password) throw new Error('CLIENTFINDER_ALLOWED_ORIGIN must be an exact HTTPS origin without a path.');
  return url.origin;
}

export function securityHeaders(response, { development = false } = {}) {
  const policy = [
    "default-src 'none'", `script-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' https: http://127.0.0.1:4318${development ? ' ws://127.0.0.1:* ws://localhost:* ws://[::1]:*' : ''}`,
    "base-uri 'none'", "object-src 'none'", "frame-src 'none'", "frame-ancestors 'none'", "form-action 'self'", "worker-src 'self'",
  ].join('; ');
  response.setHeader('Content-Security-Policy', policy);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), serial=(), bluetooth=()');
  response.setHeader('Cache-Control', 'no-store');
}

// One personal workspace. Bound work globally rather than trusting spoofable IP headers.
export function createRequestLimits({ limit = 300, windowMs = 60000, now = Date.now } = {}) {
  let count = 0, reset = 0;
  const active = new Map();
  return {
    enter(path, method) {
      if (now() >= reset) { count = 0; reset = now() + windowMs; }
      if (++count > limit) throw httpError(429, 'Too many requests. Wait a minute and retry.');
      const group = ['/api/audits/scan', '/api/audits/prospects/research'].includes(path) ? 'ai-start' : path.endsWith('/map/search') ? 'map-search' : path.endsWith('/insights/check') ? 'capture' : path.endsWith('/proposal/export') ? 'export' : path.includes('/insights/') ? 'integration' : path.endsWith('/business-image') ? 'image' : method === 'POST' ? 'write' : 'read';
      const capacity = { 'ai-start': 1, 'map-search': 1, capture: 1, export: 1, integration: 4, image: 12, write: 4, read: 12 }[group];
      if ((active.get(group) || 0) >= capacity) throw httpError(429, 'This operation is busy. Wait for it to finish and retry.');
      active.set(group, (active.get(group) || 0) + 1);
      return () => active.set(group, active.get(group) - 1);
    },
  };
}
