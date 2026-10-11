import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { localRequestOrigin, securityHeaders } from './security.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const within = (parent, path) => path === parent || path.startsWith(parent + sep);
export function sensitivePath(raw) {
  let path = raw.split('?')[0];
  try { for (let i = 0; i < 3; i++) { const decoded = decodeURIComponent(path); if (decoded === path) break; path = decoded; } } catch { return true; }
  path = path.replaceAll('\\', '/');
  return /(?:^|\/)\.(?:clientfinder|runtime|git|impeccable|env)(?:[./]|$)/i.test(path) || /(?:^|\/)connection-token(?:[./]|$)/i.test(path) || /\.(?:pem|key|crt)(?:[/?]|$)/i.test(path);
}

export function createStaticHandler(dist) {
  return async (request, response) => {
    securityHeaders(response);
    try {
      localRequestOrigin(request);
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
      if (sensitivePath(request.url)) { response.writeHead(403); response.end('Private file.'); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (/[\\\u0000:]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) throw new Error('Invalid path');
      const root = await realpath(dist), path = resolve(root, `.${pathname}`);
      if (!within(root, path)) throw new Error('Invalid path');
      const target = extname(path) ? path : resolve(root, 'index.html');
      if (!types[extname(target)] || !within(root, await realpath(target)) || !(await stat(target)).isFile()) throw new Error('Invalid file');
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': types[extname(target)], 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) { response.writeHead(error.status || 404); response.end(error.status === 403 ? error.message : 'Not found. Build the site with npm run build.'); }
  };
}
