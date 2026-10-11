import { useCallback, useEffect, useRef, useState } from 'react';
import { readStored, writeStored } from './api.mjs';

const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const endpoint = local ? '/api/audits' : 'http://127.0.0.1:4318/api/audits';
const getToken = () => { try { return sessionStorage.getItem('cf:audit-token') || ''; } catch { return ''; } };

export function useAudits() {
  const [reports, setReports] = useState(() => readStored('cf:audits', {}) || {});
  const [connection, setConnection] = useState(null), [job, setJob] = useState(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [submitting, setSubmitting] = useState(false);
  const [provider, setProvider] = useState(() => readStored('cf:audit-provider', 'codex'));
  const [token, setToken] = useState(getToken);
  const inFlight = useRef(false), mounted = useRef(true);
  const request = useCallback(async (path, body) => {
    const response = await fetch(`${endpoint}${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'omit', redirect: 'error', headers: { 'X-Leadrove-Client': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path.startsWith('/insights') || path.startsWith('/proposal') || path === '/map/search' ? 180_000 : 30_000) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Start the local audit service to connect your subscription.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not contact the audit service.');
    return data;
  }, [token]);
  const refresh = useCallback(async (force = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (force) setLoading(true);
    try {
      const data = await request(`/state${force ? '?refresh=1' : ''}`);
      if (!mounted.current) return;
      setConnection({ providers: data.providers, browser: data.browser }); setJob(data.job); setError('');
      if (data.reports && typeof data.reports === 'object') {
        setReports(previous => { const next = { ...previous, ...data.reports }; writeStored('cf:audits', next); return next; });
      }
    } catch (e) { if (mounted.current) { setConnection(null); setError(e.name === 'TypeError' || e.name === 'TimeoutError' ? 'Local audit service unavailable. Start it on this computer, then refresh connection.' : e.message); } }
    finally { inFlight.current = false; if (mounted.current) setLoading(false); }
  }, [request]);
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; }; }, [refresh]);
  useEffect(() => { if (job?.status !== 'running') return; const timer = setInterval(() => { void refresh(); }, 2000); return () => clearInterval(timer); }, [job?.status, refresh]);
  async function start(businesses) {
    setSubmitting(true); setError('');
    try {
      const next = await request('/scan', { provider, businesses: businesses.map(({ name, website, websiteStatus }) => ({ name, website, websiteStatus })) });
      setJob(next); return true;
    } catch (e) { setError(e.message); return false; } finally { setSubmitting(false); }
  }
  async function cancel() { try { await request('/cancel', {}); await refresh(); } catch (e) { setError(e.message); } }
  function connect(value) { const cleaned = value.trim(); try { sessionStorage.setItem('cf:audit-token', cleaned); } catch { /* Session-only connection still works. */ } setToken(cleaned); }
  function chooseProvider(value) { setProvider(value); writeStored('cf:audit-provider', value); }
  return { reports, connection, job, error, loading, submitting, provider, chooseProvider, start, cancel, refresh, connect, local, request,
    running: job?.status === 'running', ready: !!connection?.browser && !!connection?.providers?.[provider]?.ready };
}
