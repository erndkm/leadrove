import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readStored, writeStored } from './api.mjs';
import { DEFAULT_PROFILE, cleanProfile, dayKey, addDays } from './prospect-model.mjs';
import { cleanWorkspace, mergeWorkspace, cleanLead } from './prospect-storage.mjs';
import { cleanWatchlist } from './workflow-model.mjs';

function loadWorkspace() {
  const cached = readStored('cf:prospects', null);
  try { if (cached) return cleanWorkspace(cached); } catch { /* Preserve the old saved-lead collection below. */ }
  const leads = {};
  for (const [id, value] of Object.entries(readStored('cf:saved', {}) || {})) { try { leads[id] = cleanLead(value); } catch { /* A damaged record must not hide the other leads. */ } }
  return { version: 1, leads, tombstones: {}, settings: DEFAULT_PROFILE, settingsUpdatedAt: 0 };
}
export function useProspects(request) {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const [research, setResearch] = useState(() => readStored('cf:research', {}) || {});
  const [job, setJob] = useState(null), [error, setError] = useState(''), [storage, setStorage] = useState('Connecting local backup…');
  const [connected, setConnected] = useState(false), [submitting, setSubmitting] = useState(false), [retry, setRetry] = useState(0);
  const alive = useRef(true), latest = useRef(workspace), saving = useRef(false), acknowledged = useRef('');
  latest.current = workspace;
  const applyRemote = useCallback(remote => setWorkspace(previous => { const merged = mergeWorkspace(previous, cleanWorkspace(remote)); return JSON.stringify(merged) === JSON.stringify(previous) ? previous : merged; }), []);
  const refresh = useCallback(async () => {
    try {
      const data = await request('/prospects/state');
      if (!alive.current) return;
      applyRemote(data.workspace); setResearch(data.research || {}); writeStored('cf:research', data.research || {}); setJob(data.job); setConnected(true); setError('');
    } catch (e) { if (alive.current) { setConnected(false); setStorage('Browser copy only · connect local service for backup'); setError(e.message); } }
  }, [request, applyRemote]);
  useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; }; }, [refresh, retry]);
  useEffect(() => { if (job?.status !== 'running') return; const timer = setInterval(() => void refresh(), 2500); return () => clearInterval(timer); }, [job?.status, refresh]);
  useEffect(() => {
    const stored = writeStored('cf:prospects', workspace);
    writeStored('cf:saved', workspace.leads);
    if (!stored) setStorage('Browser storage is full · download a backup');
    if (!connected) return;
    const timer = setTimeout(async () => {
      if (saving.current) return;
      saving.current = true;
      try {
        // Drain edits made while a write was in flight; do not lose the final edit.
        while (alive.current && JSON.stringify(latest.current) !== acknowledged.current) {
          const snapshot = latest.current;
          setStorage('Saving locally…');
          const data = await request('/prospects/save', snapshot);
          acknowledged.current = JSON.stringify(snapshot);
          if (alive.current) { applyRemote(data.workspace); setStorage('Saved on this computer'); }
        }
      } catch (e) { if (alive.current) { setStorage('Local backup failed · browser copy kept'); setError(e.message); setConnected(false); } }
      finally { saving.current = false; }
    }, 500);
    return () => clearTimeout(timer);
  }, [workspace, connected, request, applyRemote]);
  function saveBusiness(business, patch = {}) {
    setWorkspace(previous => {
      const old = previous.leads[business.id];
      const updatedAt = Math.max(Date.now(), (old?.updatedAt || 0) + 1, (previous.tombstones[business.id] || 0) + 1);
      const change = patch.status && patch.status !== old?.status ? [{ at: new Date().toISOString(), text: `Status: ${patch.status}` }] : [];
      const lead = cleanLead({ status: 'To review', notes: '', savedAt: Date.now(), dealCurrency: previous.settings.currency, ...old, business, ...patch, updatedAt, history: patch.history || [...(old?.history || []), ...change] });
      return { ...previous, leads: { ...previous.leads, [business.id]: lead } };
    });
  }
  function removeBusiness(id) { setWorkspace(previous => { const leads = { ...previous.leads }; const at = Math.max(Date.now(), (leads[id]?.updatedAt || 0) + 1); delete leads[id]; return { ...previous, leads, tombstones: { ...previous.tombstones, [id]: at } }; }); }
  function saveProfile(settings) { setWorkspace(previous => ({ ...previous, settings: cleanProfile(settings), settingsUpdatedAt: Math.max(Date.now(), previous.settingsUpdatedAt + 1) })); }
  function saveWatchlist(value) { setWorkspace(previous => { const item = cleanWatchlist({ ...value, updatedAt: Math.max(Date.now(), (previous.watchlists?.[value.id]?.updatedAt || 0) + 1, (previous.watchlistTombstones?.[value.id] || 0) + 1) }); return item ? { ...previous, watchlists: { ...previous.watchlists, [item.id]: item } } : previous; }); }
  function removeWatchlist(id) { setWorkspace(previous => { const watchlists = { ...previous.watchlists }; const at = Math.max(Date.now(), (watchlists[id]?.updatedAt || 0) + 1); delete watchlists[id]; return { ...previous, watchlists, watchlistTombstones: { ...previous.watchlistTombstones, [id]: at } }; }); }
  async function start(businesses, provider) {
    setSubmitting(true); setError('');
    try { const data = await request('/prospects/research', { businesses, provider }); setJob(data.job); return true; }
    catch (e) { setError(e.message); return false; } finally { setSubmitting(false); }
  }
  async function cancel() { try { await request('/prospects/cancel', {}); await refresh(); } catch (e) { setError(e.message); } }
  function contacted(b) {
    const old = latest.current.leads[b.id];
    saveBusiness(b, { status: 'Contacted', lastContact: new Date().toISOString(), completedDate: dayKey(), nextDate: addDays(3), nextAction: 'Follow up on the website conversation', history: [...(old?.history || []), { at: new Date().toISOString(), text: 'Marked contacted; follow-up scheduled in 3 days.' }] });
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ ...latest.current, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `leadrove-backup-${dayKey()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file) {
    if (!file || file.size > 10000000) throw new Error('Choose a Leadrove JSON backup smaller than 10 MB.');
    const restored = cleanWorkspace(JSON.parse(await file.text()));
    setWorkspace(previous => mergeWorkspace(previous, restored));
    return Object.keys(restored.leads).length;
  }
  const researchReports = useMemo(() => Object.values(research).reduce((all, r) => { if (r?.audit?.website) all[r.audit.website] = r.audit; return all; }, {}), [research]);
  return { saved: workspace.leads, watchlists: workspace.watchlists || {}, saveWatchlist, removeWatchlist, settings: workspace.settings, research, researchReports, job, error, storage, connected, submitting, running: job?.status === 'running', saveBusiness, removeBusiness, saveProfile, start, cancel, contacted, exportBackup, importBackup, retry: () => setRetry(n => n + 1), refresh };
}
