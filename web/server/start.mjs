import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { createAuditApi } from './http.mjs';
import { createStaticHandler } from './static.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const env = loadEnv('production', root, '');
const overpassEndpoints = env.VITE_OVERPASS_URL?.trim()
  ? [env.VITE_OVERPASS_URL.trim(), ...(env.VITE_OVERPASS_FALLBACK_URLS || '').split(',').map(url => url.trim()).filter(Boolean)]
  : undefined;
const api = createAuditApi({ directory: resolve(process.env.CLIENTFINDER_DATA_DIR || resolve(root, '.clientfinder')), overpassEndpoints });
const serve = createStaticHandler(dist);
const server = createServer((request, response) => {
  void api.handle(request, response, () => serve(request, response));
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;
server.listen(4318, '127.0.0.1', () => {
  console.log('Leadrove: http://127.0.0.1:4318');
  console.log('For the hosted site, use the pairing token in .clientfinder/connection-token. Keep this terminal running.');
});
const stop = () => { api.close(); server.close(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
