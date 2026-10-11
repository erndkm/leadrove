import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { auditKey } from '../src/audit-model.mjs';
import { publicUrl } from './public-web.mjs';
import { collectEvidence, browserAvailable } from './evidence.mjs';
import { providerStatus, reviewEvidence } from './providers.mjs';

export function scanTargets(businesses) {
  if (!Array.isArray(businesses) || !businesses.length || businesses.length > 5000) throw new Error('Choose between 1 and 5,000 businesses to review.');
  const unique = new Map();
  for (const business of businesses) {
    if (!business || typeof business.website !== 'string' || business.website.length > 2000 || typeof business.name !== 'string' || business.name.length > 300) throw new Error('Invalid business data. Search the area again.');
    if (!business.website || business.websiteStatus !== 'website') continue;
    const website = auditKey(business.website);
    // Keep restricted/invalid URLs as failed items so one bad directory entry
    // cannot silently drop or prevent the rest of an area from being rated.
    const key = website || business.website;
    if (!unique.has(key)) unique.set(key, { website: key, name: business.name, status: 'queued' });
  }
  if (!unique.size) throw new Error('No dedicated websites were found in these results.');
  return [...unique.values()];
}

export function createAuditManager({ directory, capture = collectEvidence, review = reviewEvidence, status = providerStatus, hasBrowser = browserAvailable } = {}) {
  let reports = {}, job = null, controller = null, starting = false, readiness, checking;
  const file = join(directory, 'reports.json');
  const loaded = (async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try { const data = JSON.parse(await readFile(file, 'utf8')); if (data && !Array.isArray(data) && typeof data === 'object') reports = data; }
    catch (error) { if (error.code !== 'ENOENT') console.warn('Saved audit reports could not be read. New reports will be saved after the next scan.'); }
  })();
  async function connections(refresh = false) {
    if (checking) return checking;
    if (readiness && Date.now() - readiness.at < (refresh ? 5000 : 20000)) return readiness;
    checking = (async () => { const [codex, claude, browser] = await Promise.all([status('codex'), status('claude'), hasBrowser()]); return readiness = { at: Date.now(), providers: { codex, claude }, browser }; })();
    try { return await checking; } finally { checking = null; }
  }
  async function persist() { await writeFile(`${file}.tmp`, JSON.stringify(reports), { mode: 0o600 }); await rename(`${file}.tmp`, file); }
  async function execute(current, abort) {
    for (const item of current.items) {
      if (abort.signal.aborted) break;
      try {
        publicUrl(item.website);
        item.status = 'capturing';
        const captured = await capture(item.website, { signal: abort.signal });
        abort.signal.throwIfAborted();
        item.status = 'reviewing';
        const report = await review(current.provider, captured, { signal: abort.signal });
        abort.signal.throwIfAborted();
        reports[item.website] = { ...report, website: item.website, provider: current.provider, scannedAt: new Date().toISOString(), evidence: captured.evidence };
        item.status = 'completed';
        item.usage = report.usage || null;
        try { await persist(); } catch { current.warning = 'Reports are available in this session, but could not be saved to disk. Export a CSV before closing.'; }
      } catch (error) {
        if (abort.signal.aborted) { item.status = 'cancelled'; break; }
        item.status = 'failed'; item.error = error.message;
        // Continuing after a provider failure could burn the whole queue on a
        // quota/auth problem. Capture failures remain per-site and continue.
        if (/Subscription|Sign in|Codex|Claude|AI review timed out/.test(error.message)) {
          current.error = error.message; current.status = 'failed'; break;
        }
      }
    }
    for (const item of current.items) if (['queued', 'capturing', 'reviewing'].includes(item.status)) item.status = 'cancelled';
    if (current.status !== 'failed') current.status = abort.signal.aborted ? 'cancelled' : 'completed';
    current.finishedAt = Date.now();
    readiness = null;
  }
  return {
    isRunning: () => starting || job?.status === 'running',
    async state(refresh = false) { await loaded; return { ...await connections(refresh), reports, job }; },
    async start({ businesses, provider }) {
      await loaded;
      if (starting || job?.status === 'running') throw new Error('A website scan is already running.');
      if (!['codex', 'claude'].includes(provider)) throw new Error('Choose Codex or Claude.');
      const items = scanTargets(businesses);
      starting = true;
      try {
        const connected = await connections();
        if (!connected.browser) throw new Error('Install the audit browser with npm run audit:setup, then refresh connection.');
        if (!connected.providers[provider].ready) throw new Error(connected.providers[provider].message);
        controller = new AbortController();
        job = { id: randomUUID(), provider, status: 'running', startedAt: Date.now(), items };
        void execute(job, controller).catch(error => { job.status = 'failed'; job.error = error.message; });
        return job;
      } finally { starting = false; }
    },
    cancel() { controller?.abort(); return { cancelled: true }; },
    close() { controller?.abort(); },
  };
}
