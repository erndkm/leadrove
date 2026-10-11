import { timingSafeEqual, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createAuditManager } from './audits.mjs';
import { createProspectManager } from './prospects.mjs';
import { createBusinessImages } from './business-images.mjs';
import { inspectOpportunity, loadScreenshots, measurePageSpeed, validateEmail, findReputation, integrationStatus } from './opportunities.mjs';
import { exportProposal } from './proposal-export.mjs';
import { cleanLead } from '../src/prospect-storage.mjs';
import { buildBusinessQuery } from '../../shared/business-query.mjs';
import { createOverpassClient } from '../../shared/overpass.mjs';
import { CLIENT_HEADER, configuredOrigin, createRequestLimits, httpError, localRequestOrigin, securityHeaders } from './security.mjs';

const json = (response, status, value) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
const sameToken = (actual, expected) => { const a = Buffer.from(actual || ''), b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); };

export async function readBody(request, maxBytes = 2_000_000, timeoutMs = 10000) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw httpError(415, 'Use a JSON request.');
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') throw httpError(415, 'Compressed requests are not supported.');
  if (Number(request.headers['content-length']) > maxBytes) throw httpError(413, 'This request is too large. Use a smaller batch or backup.');
  const body = await new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    const cleanup = () => { clearTimeout(timer); request.off('data', data); request.off('end', end); request.off('error', fail); request.off('aborted', aborted); };
    const fail = error => { cleanup(); request.resume(); reject(error); };
    const aborted = () => fail(httpError(400, 'The request was interrupted.'));
    const data = chunk => { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > maxBytes) fail(httpError(413, 'This request is too large. Use a smaller batch or backup.')); else chunks.push(bytes); };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks).toString('utf8')); };
    const timer = setTimeout(() => fail(httpError(408, 'The request body took too long to arrive.')), timeoutMs);
    request.on('data', data); request.once('end', end); request.once('error', fail); request.once('aborted', aborted);
  });
  let value;
  try { value = JSON.parse(body); } catch { throw httpError(400, 'Invalid JSON request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'Use a JSON object.');
  return value;
}

export function createAuditApi({ directory, manager = createAuditManager({ directory }), allowedOrigin = process.env.CLIENTFINDER_ALLOWED_ORIGIN || '', token: providedToken, limits = createRequestLimits(), overpassEndpoints } = {}) {
  allowedOrigin = configuredOrigin(allowedOrigin);
  const queryOverpass = createOverpassClient({
    endpoints: overpassEndpoints,
    method: 'POST',
    headers: { 'User-Agent': 'Leadrove/1.0 (local business discovery app)' },
  });
  const mapCache = new Map();
  const prospects = createProspectManager({ directory, auditRunning: () => manager.isRunning?.() });
  const images = createBusinessImages();
  let insightBusy = false, exportBusy = false;
  const tokenReady = (async () => {
    if (providedToken) return providedToken;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, 'connection-token');
    const read = async () => { const value = (await readFile(path, 'utf8')).trim(); if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Local pairing is unavailable: the connection token is invalid.'); return value; };
    try { return await read(); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const value = randomBytes(32).toString('hex');
      try { await writeFile(path, value, { mode: 0o600, flag: 'wx' }); return value; }
      catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; return read(); }
    }
  })();
  // Local use still works if storing the optional hosted-page token fails.
  tokenReady.catch(() => {});
  return {
    close: () => { manager.close(); prospects.close(); },
    async handle(request, response, next = () => json(response, 404, { error: 'Not found.' })) {
      if (!/^\/api\/audits(?:\/|\?|$)/.test(request.url || '')) return next();
      let release;
      try {
        securityHeaders(response);
        const hostOrigin = localRequestOrigin(request);
        const origin = request.headers.origin;
        const ownOrigin = origin === hostOrigin;
        const remote = !!allowedOrigin && origin === allowedOrigin;
        if (origin && !ownOrigin && !remote) return json(response, 403, { error: 'This origin is not allowed.' });
        if (!origin && request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin') return json(response, 403, { error: 'Open the local workspace to connect.' });
        if (remote) {
          response.setHeader('access-control-allow-origin', allowedOrigin);
          response.setHeader('vary', 'Origin');
          response.setHeader('access-control-allow-private-network', 'true');
          response.setHeader('access-control-allow-headers', 'Authorization, Content-Type, X-Leadrove-Client');
          response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
        }
        if (request.method === 'OPTIONS') {
          if (!ownOrigin && !remote) throw httpError(403, 'This origin is not allowed.');
          if (!['GET', 'POST'].includes(request.headers['access-control-request-method'])) throw httpError(405, 'This method is not allowed.');
          const headers = (request.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
          if (headers.some(h => !['authorization', 'content-type', CLIENT_HEADER].includes(h))) throw httpError(403, 'These request headers are not allowed.');
          response.writeHead(204); response.end(); return;
        }
        if (!['GET', 'POST'].includes(request.method)) throw httpError(405, 'This method is not allowed.');
        if (request.headers[CLIENT_HEADER] !== '1') throw httpError(403, 'Open the current Leadrove app to use the local service.');
        if (remote && !sameToken(request.headers.authorization?.replace(/^Bearer /, ''), await tokenReady)) return json(response, 401, { error: 'Connect with the token from .clientfinder/connection-token on your computer, or open the local workspace.' });
        const url = new URL(request.url, hostOrigin);
        release = limits.enter(url.pathname, request.method);
        if (request.method === 'POST' && url.pathname === '/api/audits/map/search') {
          const input = await readBody(request, 5000);
          const query = buildBusinessQuery(input.center, input.radius);
          const cached = mapCache.get(query);
          if (cached) {
            mapCache.delete(query);
            if (cached.expires > Date.now()) {
              mapCache.set(query, cached);
              return json(response, 200, cached.data);
            }
          }
          try {
            const data = { ...await queryOverpass(query, AbortSignal.timeout(120_000)), fetchedAt: Date.now() };
            if (data.elements.length <= 5000) {
              mapCache.set(query, { data, expires: data.fetchedAt + 15 * 60_000 });
              if (mapCache.size > 6) mapCache.delete(mapCache.keys().next().value);
            }
            return json(response, 200, data);
          }
          catch (error) { if (error.retryable) error.status = 503; throw error; }
        }
        if (request.method === 'GET' && url.pathname === '/api/audits/integrations') return json(response, 200, integrationStatus());
        if (request.method === 'POST' && url.pathname === '/api/audits/insights/check') {
          if (insightBusy) return json(response, 409, { error: 'A website check is already running. Wait for it to finish.' });
          const input = await readBody(request), lead = cleanLead({ business: input.business, insight: input.previous });
          insightBusy = true;
          try { return json(response, 200, await inspectOpportunity(lead.business, { directory, previous: lead.insight, signal: AbortSignal.timeout(150000) })); } finally { insightBusy = false; }
        }
        if (request.method === 'POST' && url.pathname === '/api/audits/insights/images') { const input = await readBody(request, 2000); return json(response, 200, await loadScreenshots(directory, input.id)); }
        if (request.method === 'POST' && url.pathname === '/api/audits/insights/performance') { const input = await readBody(request, 5000); return json(response, 200, await measurePageSpeed(input.website)); }
        if (request.method === 'POST' && url.pathname === '/api/audits/insights/email') { const input = await readBody(request, 2000); return json(response, 200, await validateEmail(input.email)); }
        if (request.method === 'POST' && url.pathname === '/api/audits/insights/reputation') { const input = await readBody(request, 20000); const lead = cleanLead({ business: input.business }); return json(response, 200, await findReputation(lead.business)); }
        if (request.method === 'POST' && url.pathname === '/api/audits/proposal/export') {
          if (exportBusy) return json(response, 409, { error: 'A report is being prepared. Try again when it finishes.' });
          const input = await readBody(request); exportBusy = true;
          try { return json(response, 200, await exportProposal(input, directory)); } finally { exportBusy = false; }
        }
        if (request.method === 'POST' && url.pathname === '/api/audits/business-image') return json(response, 200, await images.resolve(await readBody(request, 16000)));
        if (request.method === 'GET' && url.pathname === '/api/audits/state') return json(response, 200, await manager.state(url.searchParams.has('refresh')));
        if (request.method === 'GET' && url.pathname === '/api/audits/prospects/state') return json(response, 200, await prospects.state());
        if (request.method === 'POST' && url.pathname === '/api/audits/prospects/save') return json(response, 200, await prospects.save(await readBody(request, 10_000_000)));
        if (request.method === 'POST' && url.pathname === '/api/audits/prospects/research') return json(response, 202, await prospects.start(await readBody(request)));
        if (request.method === 'POST' && url.pathname === '/api/audits/prospects/cancel') { await readBody(request); return json(response, 200, prospects.cancel()); }
        if (request.method === 'POST' && url.pathname === '/api/audits/scan') {
          if (prospects.isRunning()) return json(response, 409, { error: 'Wait for prospect research to finish before starting a website scan.' });
          return json(response, 202, await manager.start(await readBody(request)));
        }
        if (request.method === 'POST' && url.pathname === '/api/audits/cancel') { await readBody(request); return json(response, 200, manager.cancel()); }
        return json(response, 404, { error: 'Audit endpoint not found.' });
      } catch (error) {
        if (!response.headersSent && !response.destroyed) {
          if (error.status === 429) response.setHeader('Retry-After', '60');
          if ([408, 413, 415].includes(error.status)) response.setHeader('Connection', 'close');
          json(response, error.status || 400, { error: error.code ? 'The local operation failed. Check the service and retry.' : error.message });
        }
      } finally { release?.(); }
    },
  };
}
