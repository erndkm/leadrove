export const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const retryableStatuses = new Set([406, 408, 429, 500, 502, 503, 504]);
const failure = (message, retryable = true, retryAfter = 30000) => Object.assign(new Error(message), { retryable, retryAfter });
const checkAbort = signal => { if (signal?.aborted) throw signal.reason || Object.assign(new Error('Search cancelled.'), { name: 'AbortError' }); };
const waitFor = (delay, signal) => new Promise((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(signal.reason || Object.assign(new Error('Search cancelled.'), { name: 'AbortError' })); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, delay);
  signal?.addEventListener('abort', abort, { once: true });
});

// Try providers sequentially, and avoid sending each new scan to a failing server.
// A custom endpoint stays private unless explicit fallbacks were configured.
export function createOverpassClient({ endpoints = DEFAULT_OVERPASS_ENDPOINTS, fetchImpl = (...args) => fetch(...args), now = () => Date.now(), sleep = waitFor, timeoutMs = 35000, method = 'GET', headers = {} } = {}) {
  const providers = [...new Set(endpoints.map(endpoint => endpoint.trim()).filter(Boolean))];
  const cooldowns = new Map();
  let preferred;

  async function request(endpoint, query, signal) {
    checkAbort(signal);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      let url;
      try { url = new URL(endpoint); } catch { throw failure('Configure a valid HTTPS map provider URL.', false); }
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw failure('Map providers must use HTTPS without URL credentials or fragments.', false);
      const options = { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json', ...headers } };
      if (method === 'POST') {
        options.method = 'POST';
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        options.body = `data=${encodeURIComponent(query)}`;
      } else url.searchParams.set('data', query);
      const response = await fetchImpl(url, options);
      checkAbort(signal);
      if (!response.ok) {
        const retryHeader = response.headers.get('retry-after');
        const delay = retryHeader && (/^\d+$/.test(retryHeader) ? Number(retryHeader) * 1000 : Date.parse(retryHeader) - now());
        const message = response.status === 429 || response.status === 406
          ? 'The map service is busy. Wait a moment and try again.'
          : retryableStatuses.has(response.status)
            ? 'The map service is temporarily unavailable. Wait a moment and try again.'
            : `The map service rejected the search (HTTP ${response.status}). Check the map provider configuration.`;
        throw failure(message, retryableStatuses.has(response.status), Math.max(30000, Number.isFinite(delay) ? delay : 0));
      }
      let data;
      try { data = await response.json(); }
      catch (error) { if (controller.signal.aborted) throw error; throw failure('The map service returned an invalid response. Please try again.'); }
      checkAbort(signal);
      if (controller.signal.aborted) throw failure('The map search timed out. Try again or use a smaller radius.');
      if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) throw failure('The map service returned an invalid response. Please try again.');
      if (data.remark) throw failure('The map service could not finish this area. Try again or use a smaller radius.');
      return data;
    } catch (error) {
      checkAbort(signal);
      if (controller.signal.aborted) throw failure('The map search timed out. Try again or use a smaller radius.');
      if (error instanceof TypeError) throw failure('Could not reach the map services. Check your connection and try again.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  return async function queryOverpass(query, signal) {
    checkAbort(signal);
    if (!providers.length) throw failure('No map provider is configured.', false);
    let available = providers.filter(endpoint => (cooldowns.get(endpoint) || 0) <= now());
    if (!available.length) {
      const remaining = Math.max(0, Math.min(...cooldowns.values()) - now());
      if (remaining <= 10000) {
        if (remaining) await sleep(remaining, signal);
        checkAbort(signal);
        available = providers.filter(endpoint => (cooldowns.get(endpoint) || 0) <= now());
      }
      if (!available.length) {
        const seconds = Math.max(1, Math.ceil((Math.min(...cooldowns.values()) - now()) / 1000));
        throw failure(`The map services are busy. Try again in ${seconds} seconds.`, false, seconds * 1000);
      }
    }
    const ordered = preferred && available.includes(preferred) ? [preferred, ...available.filter(endpoint => endpoint !== preferred)] : available;
    let lastError;
    for (const endpoint of ordered) {
      try {
        const data = await request(endpoint, query, signal);
        preferred = endpoint;
        cooldowns.delete(endpoint);
        return data;
      } catch (error) {
        checkAbort(signal);
        if (!error.retryable) throw error;
        cooldowns.set(endpoint, now() + error.retryAfter);
        lastError = error;
      }
    }
    throw lastError;
  };
}
