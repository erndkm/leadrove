import { resolve, sep } from 'node:path';
import { createAuditApi } from './http.mjs';
import { localRequestOrigin, securityHeaders } from './security.mjs';
import { sensitivePath } from './static.mjs';

export function localAudits({ overpassEndpoints } = {}) {
  let api;
  const directory = resolve(process.env.CLIENTFINDER_DATA_DIR || '.clientfinder');
  const comparable = path => process.platform === 'win32' ? path.toLowerCase() : path;
  const configure = server => {
    api ||= createAuditApi({ directory, overpassEndpoints });
    server.middlewares.use((request, response, next) => {
      securityHeaders(response, { development: !!server.moduleGraph });
      try {
        localRequestOrigin(request);
        const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replaceAll('\\', '/');
        const file = path.startsWith('/@fs/') ? resolve(path.slice(5)) : resolve(server.config.root, `.${path}`);
        if (sensitivePath(request.url) || comparable(file) === comparable(directory) || comparable(file).startsWith(comparable(directory + sep))) { response.writeHead(403); response.end('Private file.'); return; }
      } catch { response.writeHead(403); response.end('Open the local Leadrove workspace.'); return; }
      void api.handle(request, response, next);
    });
    server.httpServer?.once('close', () => api.close());
  };
  return { name: 'clientfinder-local-audits', config: () => ({ server: { host: '127.0.0.1', cors: false, fs: { strict: true, deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/.clientfinder/**', '**/.impeccable/**', '**/.runtime/**', directory.replaceAll('\\', '/') + '/**'] } }, preview: { host: '127.0.0.1', cors: false } }), configureServer: configure, configurePreviewServer: configure };
}
