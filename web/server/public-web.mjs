import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address) {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
    return parsed.range() === 'unicast';
  } catch { return false; }
}

export function publicUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 3000 || /[\u0000-\u0020\u007f]/.test(raw)) throw new Error('Use a valid public website URL.');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) {
    throw new Error('Only public HTTP or HTTPS websites on standard ports can be scanned.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') && !ipaddr.isValid(host) || /(^|\.)(localhost|local|localdomain|internal|lan|home|home\.arpa|test|invalid|onion)$/.test(host) || (ipaddr.isValid(host) && !isPublicAddress(host))) {
    throw new Error('Private and local network addresses cannot be scanned.');
  }
  url.hash = '';
  return url;
}

// Resolve once and pin the socket to that address. Validating DNS and then using
// an ordinary fetch would allow a second DNS lookup to reach a private host.
export async function requestPublic(raw, { signal, maxBytes = 6_000_000, resolve = lookup } = {}) {
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(12000)]);
  signal.throwIfAborted();
  const url = publicUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await new Promise((done, fail) => {
    const aborted = () => fail(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => resolve(hostname, { all: true })).then(done, fail).finally(() => signal.removeEventListener('abort', aborted));
  });
  signal?.throwIfAborted();
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('This hostname resolves to a restricted network address.');
  const address = addresses[0];
  return new Promise((resolveResponse, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'GET', signal, agent: false,
      lookup: (_host, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family),
      headers: { 'user-agent': 'Leadrove/1.0 (personal website review)', accept: '*/*', 'accept-encoding': 'identity' },
    }, response => {
      if (Number(response.headers['content-length']) > maxBytes) { response.destroy(new Error('Website response exceeded the scan size limit.')); }
      const chunks = []; let length = 0;
      response.on('data', chunk => {
        length += chunk.length;
        if (length > maxBytes) { response.destroy(new Error('Website response exceeded the scan size limit.')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      const tlsExpiry = response.socket.getPeerCertificate?.()?.valid_to || '';
      response.on('end', () => resolveResponse({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks), tlsExpiry }));
    });
    const timer = setTimeout(() => request.destroy(new Error('Website request timed out.')), 12_000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
    request.end();
  });
}
