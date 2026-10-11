import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { cleanWorkspace, mergeWorkspace, cleanLead } from '../src/prospect-storage.mjs';
import { DEFAULT_PROFILE } from '../src/prospect-model.mjs';
import { discoverBusiness, verifyResearch } from './prospect-research.mjs';
import { collectEvidence } from './evidence.mjs';
import { providerStatus, reviewEvidence } from './providers.mjs';

export function createProspectManager({ directory, discover = discoverBusiness, verify = verifyResearch, capture = collectEvidence, review = reviewEvidence, status = providerStatus, auditRunning = () => false } = {}) {
  const file = join(directory, 'prospects.json');
  let workspace = { version: 1, leads: {}, tombstones: {}, settings: DEFAULT_PROFILE, settingsUpdatedAt: 0 }, research = {}, job = null, controller, starting = false, pending = Promise.resolve();
  const loaded = (async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let raw;
    try { raw = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return;
      try { raw = JSON.parse(await readFile(`${file}.bak`, 'utf8')); }
      catch { throw new Error('Local lead data could not be read. Restore a Leadrove backup before saving more research.'); }
    }
    workspace = cleanWorkspace(raw.workspace);
    research = raw.research && typeof raw.research === 'object' && !Array.isArray(raw.research) ? raw.research : {};
    job = raw.job || null;
    if (job?.status === 'running') { job.status = 'interrupted'; job.error = 'The service restarted. Completed research is saved; retry the remaining businesses.'; job.items = job.items.map(item => ['queued', 'researching', 'reviewing'].includes(item.status) ? { ...item, status: 'cancelled' } : item); }
  })();
  loaded.catch(() => {});
  function persist() {
    const contents = JSON.stringify({ workspace, research, job });
    const operation = pending.catch(() => {}).then(async () => {
      try { await copyFile(file, `${file}.bak`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await writeFile(`${file}.tmp`, contents, { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    });
    pending = operation;
    return operation;
  }
  async function execute(current, abort) {
    for (const item of current.items) {
      if (abort.signal.aborted) break;
      try {
        item.status = 'researching';
        const found = await discover(current.provider, item.business, { signal: abort.signal });
        item.usage = found.usage;
        abort.signal.throwIfAborted();
        let checked;
        try { checked = await verify(item.business, found, { signal: abort.signal }); }
        catch (error) { abort.signal.throwIfAborted(); checked = { ...found, identityMatched: false, contactMatched: false, matchEvidence: error.message }; }
        const record = { ...checked, business: item.business, checkedAt: new Date().toISOString(), provider: current.provider };
        research[item.id] = record;
        if (record.identityMatched) {
          item.status = 'reviewing';
          try {
            const captured = await capture(record.website, { signal: abort.signal });
            const report = await review(current.provider, captured, { signal: abort.signal });
            abort.signal.throwIfAborted();
            record.audit = { ...report, website: record.website, provider: current.provider, scannedAt: new Date().toISOString(), evidence: captured.evidence };
            if (report.usage) item.usage = Object.fromEntries(['inputTokens', 'outputTokens', 'cachedInputTokens', 'totalTokens'].map(key => [key, (found.usage?.[key] || 0) + (report.usage[key] || 0)]));
          } catch (error) {
            abort.signal.throwIfAborted(); record.auditError = error.message;
            if (/Subscription|Sign in|Codex|Claude/.test(error.message)) throw error;
          }
        }
        item.status = 'completed'; item.matched = record.identityMatched;
        await persist();
      } catch (error) {
        if (abort.signal.aborted) { item.status = 'cancelled'; break; }
        item.status = 'failed'; item.error = error.message;
        if (/Subscription|Sign in|Codex|Claude|timed out|ENOSPC|EACCES/.test(error.message)) { current.status = 'failed'; current.error = error.message; break; }
      }
    }
    for (const item of current.items) if (['queued', 'researching', 'reviewing'].includes(item.status)) item.status = 'cancelled';
    if (current.status !== 'failed') current.status = abort.signal.aborted ? 'cancelled' : 'completed';
    current.finishedAt = Date.now();
    await persist();
  }
  return {
    isRunning: () => starting || job?.status === 'running',
    async state() { await loaded; return { workspace, research, job }; },
    async save(value) { await loaded; workspace = mergeWorkspace(workspace, cleanWorkspace(value)); await persist(); return { workspace }; },
    async start({ businesses, provider }) {
      await loaded;
      if (starting || job?.status === 'running' || auditRunning()) throw new Error('Wait for the current research or website scan to finish.');
      if (!['codex', 'claude'].includes(provider)) throw new Error('Choose Codex or Claude in Website scan.');
      if (!Array.isArray(businesses) || !businesses.length || businesses.length > 10) throw new Error('Research between 1 and 10 businesses at a time.');
      const unique = new Map(businesses.map(business => { const clean = cleanLead({ business }).business; return [clean.id, clean]; }));
      starting = true;
      try {
        const connected = await status(provider);
        if (!connected.ready) throw new Error(connected.message || 'Connect your subscription first.');
        controller = new AbortController();
        job = { id: randomUUID(), provider, status: 'running', startedAt: Date.now(), items: [...unique.values()].map(business => ({ id: business.id, business, name: business.name, status: 'queued' })) };
        await persist();
        const current = job;
        void execute(current, controller).catch(async error => { current.status = 'failed'; current.error = `Research stopped: ${error.message}`; try { await persist(); } catch { current.warning = 'Could not save to disk. Export your leads before closing.'; } });
        return { job };
      } catch (error) {
        if (job?.status === 'running') { job.status = 'failed'; job.error = 'Research could not be saved. Check local storage, then retry.'; }
        throw error;
      } finally { starting = false; }
    },
    cancel() { controller?.abort(); return { cancelled: true }; },
    close() { controller?.abort(); },
  };
}
