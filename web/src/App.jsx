import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { Search, Bookmark, ArrowUpRight, ArrowRight, ArrowDownWideNarrow, ArrowUpWideNarrow, SlidersHorizontal, X, Check, LocateFixed, Download, Building2, List, Map as MapIcon, Info, ChevronDown, CircleHelp, Sun, Moon } from 'lucide-react';
import { CATEGORIES, WEBSITE_LABELS, filterBusinesses, toCsv, distanceKm } from './model.mjs';
import { DEFAULT_CENTER, searchBusinesses, readStored, writeStored } from './api.mjs';
import LocationSearch from './LocationSearch.jsx';
import { useAudits } from './useAudits.mjs';
import { attachAudits, auditResultLabel } from './audit-model.mjs';
import { AuditControls, AuditBadge } from './WebsiteAudits.jsx';
import BusinessDetails from './LeadDetails.jsx';
import { Watchlists, Pipeline, Reports, SettingsPage } from './WorkflowPages.jsx';
import { watchlistBusiness } from './workflow-model.mjs';
import { CalendarDays, FolderSearch, ChartNoAxesCombined, FileText, Settings2 } from 'lucide-react';
import BusinessThumbnail, { BusinessImagesProvider } from './BusinessThumbnail.jsx';
import BusinessTypeLabel from './BusinessTypeLabel.jsx';
import { useProspects } from './useProspects.mjs';
import { LEAD_STAGES, effectiveBusiness, prospectFor, dailyShortlist, dayKey, money } from './prospect-model.mjs';
import { auditKey } from './audit-model.mjs';
import Today from './Today.jsx';
const BusinessMap = lazy(() => import('./BusinessMap.jsx'));
const initialFilters = { category: 'all', noWebsite: false, independent: true, contact: false, minScore: 0, query: '', sort: 'score', status: 'all', technology: 'all' };
const sortOptions = [
  { value: 'score', label: 'Score: highest first', shortLabel: 'Score' },
  { value: 'score-asc', label: 'Score: lowest first', shortLabel: 'Score', ascending: true },
  { value: 'value', label: 'Potential value: highest first', shortLabel: 'Value' },
  { value: 'value-asc', label: 'Potential value: lowest first', shortLabel: 'Value', ascending: true },
  { value: 'distance', label: 'Distance: nearest first', shortLabel: 'Distance', ascending: true },
  { value: 'website', label: 'Website quality: weakest first', shortLabel: 'Website', ascending: true },
  { value: 'name', label: 'Business name: A–Z', shortLabel: 'Name', ascending: true },
];
const statuses = LEAD_STAGES;
const scoreClass = score => score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
const formatDistance = value => value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`;
const timeLabel = stamp => new Date(stamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function App() {
  const audits = useAudits();
  const prospects = useProspects(audits.request);
  const saved = prospects.saved;
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const [result, setResult] = useState(() => { const r = readStored('cf:last-search', null); return r && Array.isArray(r.businesses) && r.center && Number.isFinite(r.radius) ? r : null; });
  const [center, setCenter] = useState(() => result?.center || DEFAULT_CENTER);
  const [locationText, setLocationText] = useState(() => center.label);
  const [locationBias, setLocationBias] = useState(() => readStored('cf:place-context', null) || (result?.center && (result.center.lat !== DEFAULT_CENTER.lat || result.center.lng !== DEFAULT_CENTER.lng) ? result.center : null));
  const locationActionsRef = useRef(null);
  const [radius, setRadius] = useState(() => result?.radius || 1.5);
  const [mapPosition, setMapPosition] = useState(center);
  const [mapProposal, setMapProposal] = useState(null);
  const activeCenter = mapProposal?.center || center;
  const [filters, setFilters] = useState(initialFilters);
  const [view, setView] = useState(() => ['today', 'discover', 'watchlists', 'pipeline', 'reports', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'discover'), [mobileView, setMobileView] = useState('list');
  const [selectedTab, setSelectedTab] = useState('overview');
  const [selectedId, setSelectedId] = useState(null), [busy, setBusy] = useState(false), [geoBusy, setGeoBusy] = useState(false);
  const [error, setError] = useState(''), [advanced, setAdvanced] = useState(false), [toast, setToast] = useState('');
  const [fitToken, setFitToken] = useState(0), [helpOpen, setHelpOpen] = useState(false);
  const [pageSize, setPageSize] = useState(60);
  const [reviewsExpanded, setReviewsExpanded] = useState(false);
  const reviewToggleRef = useRef(null);
  const running = useRef(false), helpRef = useRef(null), inspectorRef = useRef(null), searchRef = useRef(null), mapPanelRef = useRef(null), confirmAreaRef = useRef(null);
  const f = (key, value) => { setFilters(old => ({ ...old, [key]: value })); setPageSize(60); };
  const [today, setToday] = useState(dayKey);
  useEffect(() => { const timer = setInterval(() => setToday(dayKey()), 60000); return () => clearInterval(timer); }, []);
  const allBusinesses = useMemo(() => {
    const byId = new Map();
    for (const r of Object.values(prospects.research)) if (r?.business) byId.set(r.business.id, r.business);
    for (const b of result?.businesses || []) byId.set(b.id, b);
    for (const s of Object.values(saved)) if (s?.business) { const fresh = byId.get(s.business.id); byId.set(s.business.id, { ...s.business, imageUrl: s.business.imageUrl || fresh?.imageUrl || '', imageSource: s.business.imageSource || fresh?.imageSource || '' }); }
    const reports = { ...audits.reports };
    for (const r of Object.values(prospects.researchReports)) { const key = auditKey(r.website); if (key && (!reports[key] || Date.parse(r.scannedAt) > Date.parse(reports[key].scannedAt))) reports[key] = r; }
    return attachAudits([...byId.values()].map(b => ({ ...effectiveBusiness(b, saved[b.id], prospects.research[b.id]), distance: distanceKm(result?.center || center, b) })), reports).map(b => {
      const prospect = prospectFor(b, saved[b.id], prospects.settings, prospects.research[b.id]);
      return { ...b, prospect, score: prospect.score, signals: prospect.signals };
    });
  }, [result, center, saved, audits.reports, prospects.research, prospects.researchReports, prospects.settings, today]);
  const searchIds = useMemo(() => new Set((result?.businesses || []).map(b => b.id)), [result]);
  const searchSource = useMemo(() => allBusinesses.filter(b => searchIds.has(b.id)), [allBusinesses, searchIds]);
  const source = useMemo(() => view === 'saved' ? allBusinesses.filter(b => saved[b.id]) : view === 'today' ? allBusinesses : searchSource.filter(b => !b.prospect.excluded), [view, allBusinesses, searchSource, saved]);
  const businesses = useMemo(() => filterBusinesses(source, filters, saved).filter(b => filters.technology === 'all' || saved[b.id]?.insight?.technologies.includes(filters.technology)), [source, filters, saved]);
  const activeSort = sortOptions.find(option => option.value === filters.sort) || sortOptions[0];
  const SortIcon = activeSort.ascending ? ArrowUpWideNarrow : ArrowDownWideNarrow;
  const selected = useMemo(() => {
    const current = allBusinesses.find(b => b.id === selectedId);
    if (current) return current;
    const archived = watchlistBusiness(prospects.watchlists, selectedId);
    if (!archived) return null;
    const business = { ...archived, distance: distanceKm(result?.center || center, archived) };
    const prospect = prospectFor(business, saved[selectedId], prospects.settings, prospects.research[selectedId]);
    return { ...business, prospect, score: prospect.score, signals: prospect.signals };
  }, [allBusinesses, selectedId, prospects.watchlists, result, center, saved, prospects.settings, prospects.research]);
  const shortlist = useMemo(() => dailyShortlist(allBusinesses, saved, today), [allBusinesses, saved, today]);
  const followups = useMemo(() => allBusinesses.filter(b => !b.prospect.excluded && saved[b.id]?.nextDate && saved[b.id].nextDate <= today && saved[b.id].completedDate !== today && !shortlist.some(s => s.id === b.id)).sort((a, b) => saved[a.id].nextDate.localeCompare(saved[b.id].nextDate)), [allBusinesses, saved, today, shortlist]);
  const candidates = useMemo(() => allBusinesses.filter(b => !b.prospect.excluded && !b.prospect.ready && (!prospects.research[b.id] || Date.now() - Date.parse(prospects.research[b.id].checkedAt) > 90 * 86400000) && !b.chain && (prospects.settings.preferredCategory === 'all' || prospects.settings.preferredCategory === b.category)).sort((a, b) => b.score - a.score || a.distance - b.distance), [allBusinesses, prospects.research, prospects.settings]);
  const reviewQueue = useMemo(() => allBusinesses.filter(b => prospects.research[b.id] && !b.prospect.ready && !b.prospect.excluded).sort((a, b) => b.score - a.score), [allBusinesses, prospects.research]);
  const savedCount = Object.keys(saved).length;
  const areaChanged = radius !== result?.radius || activeCenter.lat !== result?.center?.lat || activeCenter.lng !== result?.center?.lng;
  const browsingElsewhere = mapPosition.browsed && distanceKm(mapPosition, activeCenter) > Math.max(0.15, radius * 0.2);
  const searchChanged = locationText !== center.label || areaChanged;
  const extraFilterCount = Number(filters.contact) + Number(filters.minScore > 0) + Number(filters.status !== 'all') + Number(filters.technology !== 'all');
  const filtersChanged = filters.category !== 'all' || filters.noWebsite || filters.independent !== (view !== 'saved') || extraFilterCount > 0 || !!filters.query;

  useEffect(() => { document.documentElement.dataset.theme = theme; writeStored('cf:theme', theme); }, [theme]);

  useEffect(() => { if (!result) runSearch(DEFAULT_CENTER, radius, 'discover', false); }, []);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(''), 3500); return () => clearTimeout(id); } }, [toast]);
  useEffect(() => { const handler = e => { if (e.key === 'Escape') { setSelectedId(null); locationActionsRef.current?.dismiss(); setAdvanced(false); } if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) { e.preventDefault(); searchRef.current?.focus(); } }; document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler); }, []);
  useEffect(() => { if (selectedId) inspectorRef.current?.focus(); }, [selectedId]);
  useEffect(() => {
    if (!mapProposal) return;
    confirmAreaRef.current?.focus({ preventScroll: true });
    const handler = e => { if (e.key === 'Escape') cancelMapProposal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mapProposal]);

  function rememberSearchArea(nextCenter) { setLocationBias(nextCenter); writeStored('cf:place-context', nextCenter); }
  async function runSearch(nextCenter = activeCenter, nextRadius = radius, destination = 'discover', rememberArea = true) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); locationActionsRef.current?.dismiss(); setMapProposal(null);
    if (rememberArea) rememberSearchArea(nextCenter);
    setCenter(nextCenter); setLocationText(nextCenter.label); setRadius(Number(nextRadius));
    try {
      const data = await searchBusinesses(nextCenter, Number(nextRadius), audits.request);
      setResult(data); setCenter(nextCenter); setLocationText(nextCenter.label); setRadius(Number(nextRadius));
      setSelectedId(null); setPageSize(60); setFitToken(n => n + 1); setView(destination);
      writeStored('cf:last-search', data);
      return data;
    } catch (e) { setError(e.message); } finally { setBusy(false); running.current = false; }
  }
  async function submitSearch(e) {
    e?.preventDefault();
    if (busy || geoBusy) return;
    if (mapProposal || locationText.trim() === center.label) return runSearch();
    setError(''); locationActionsRef.current?.search();
  }
  function saveBusiness(b, patch = {}) {
    prospects.saveBusiness(b, patch);
  }
  function toggleSave(b) {
    if (saved[b.id]) { prospects.removeBusiness(b.id); setToast(`${b.name} removed from saved leads`); }
    else { saveBusiness(b); setToast(`${b.name} saved`); }
  }
  function showRated() { setView('discover'); setFilters({ ...initialFilters, noWebsite: false, independent: false, sort: 'website' }); setPageSize(60); }
  async function scanWebsites() { if (await audits.start(searchSource)) showRated(); }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(businesses, saved)], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `leadrove-${view}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast(`${businesses.length} leads exported`);
  }
  function locate() {
    if (!navigator.geolocation) { setError('Location is unavailable in this browser. Enter a town or address instead.'); return; }
    setGeoBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(p => { setGeoBusy(false); const c = { lat: p.coords.latitude, lng: p.coords.longitude, label: 'My current location' }; setCenter(c); setLocationText(c.label); runSearch(c); }, () => { setGeoBusy(false); setError('Location could not be accessed. Enter a town or address instead.'); }, { timeout: 10000, maximumAge: 300000 });
  }
  function switchView(next) { setView(next); setSelectedTab('overview'); location.hash = next; setSelectedId(null); if (next !== 'watchlists') setFilters({ ...initialFilters, independent: next !== 'saved' }); setPageSize(60); }
  function selectLead(id, tab = 'overview') { setSelectedTab(tab); setSelectedId(id); }
  function showHelp() { setHelpOpen(true); helpRef.current?.showModal(); }
  function openReviewSetup() {
    setSelectedId(null);
    setView('settings');
    setReviewsExpanded(true);
    requestAnimationFrame(() => reviewToggleRef.current?.focus());
  }
  function previewArea() {
    setMobileView('map'); setSelectedId(null); setFitToken(n => n + 1);
    if (matchMedia('(max-width: 680px)').matches) requestAnimationFrame(() => mapPanelRef.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
  }
  function chooseArea(nextCenter) { setMapProposal(null); setCenter(nextCenter); setLocationText(nextCenter.label); rememberSearchArea(nextCenter); locationActionsRef.current?.dismiss(); previewArea(); }
  function proposeMapArea() {
    const next = { lat: mapPosition.lat, lng: mapPosition.lng, label: `Map area · ${mapPosition.lat.toFixed(3)}, ${mapPosition.lng.toFixed(3)}` };
    setMapProposal(previous => ({ center: next, originalRadius: previous?.originalRadius ?? radius }));
    locationActionsRef.current?.dismiss(); previewArea();
  }
  function cancelMapProposal() {
    if (!mapProposal) return;
    setRadius(mapProposal.originalRadius); setMapProposal(null); previewArea();
  }

  useEffect(() => { const change = () => { const next = location.hash.slice(1); if (['today', 'discover', 'watchlists', 'pipeline', 'reports', 'settings'].includes(next)) { setView(next); setSelectedId(null); } }; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  const detailOverlay = selected && <div className="today-inspector"><BusinessDetails key={selected.id + selectedTab} initialTab={selectedTab} business={selected} savedLead={saved[selected.id]} audits={audits} statuses={statuses} panelRef={inspectorRef} researchLocation={(result?.center || center).label} prospects={prospects} onSave={patch => saveBusiness(selected, patch)} onToggleSave={() => toggleSave(selected)} onReviewSetup={openReviewSetup} onSettings={() => switchView('settings')} onClose={() => setSelectedId(null)} /></div>;
  return <BusinessImagesProvider request={audits.request}><div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Leadrove — discover local opportunities" onClick={e => { e.preventDefault(); switchView('discover'); }}><img className="brand-logo brand-logo-light" src="/brand/leadrove-logo.svg?v=leadrove-3" width="168" height="40" alt="Leadrove" /><img className="brand-logo brand-logo-dark" src="/brand/leadrove-logo-dark.svg?v=leadrove-3" width="168" height="40" alt="" aria-hidden="true" /></a>
      <nav className="main-nav workflow-nav" aria-label="Main navigation">
        {[['today', 'Today', CalendarDays], ['discover', 'Discover', Search], ['pipeline', 'Pipeline', ChartNoAxesCombined], ['reports', 'Proposals', FileText], ['settings', 'Settings', Settings2]].map(([id, label, Icon]) => <button key={id} className={view === id || id === 'discover' && view === 'watchlists' ? 'active' : ''} aria-current={view === id || id === 'discover' && view === 'watchlists' ? 'page' : undefined} onClick={() => switchView(id)}><Icon size={16} /><span>{label}</span>{id === 'pipeline' && savedCount > 0 && <span className="nav-count">{savedCount}</span>}</button>)}
      </nav>
      <div className="header-right"><button className="icon-button help-toggle" onClick={showHelp} aria-label="How Leadrove works"><CircleHelp size={19} /></button><button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></div>
    </header>

    <main className={view === 'today' ? 'today-main' : undefined}>
      {['discover', 'saved'].includes(view) && <h1 className="sr-only">{view === 'saved' ? 'Saved leads' : 'Find local businesses'}</h1>}
      {['discover', 'watchlists'].includes(view) && <div className="discovery-navigation"><div><button className={view === 'discover' ? 'selected' : ''} onClick={() => switchView('discover')}><Search size={16} />Area search</button><button className={view === 'watchlists' ? 'selected' : ''} onClick={() => switchView('watchlists')}><FolderSearch size={16} />Watchlists{Object.keys(prospects.watchlists).length > 0 && <span>{Object.keys(prospects.watchlists).length}</span>}</button></div>{view === 'discover' && result && <button className="text-button" onClick={() => switchView('watchlists')}><Bookmark size={14} />Save this search</button>}</div>}
      {view === 'watchlists' ? <><Watchlists request={audits.request} prospects={prospects} current={result} filters={filters} onRun={w => runSearch(w.center, w.radius, 'watchlists')} onDiscover={() => switchView('discover')} onSelect={selectLead} busy={busy} />{detailOverlay}</> : view === 'pipeline' ? <><Pipeline businesses={allBusinesses} prospects={prospects} onSelect={selectLead} onDiscover={() => switchView('discover')} />{detailOverlay}</> : view === 'reports' ? <><Reports businesses={allBusinesses} prospects={prospects} onSelect={selectLead} onDiscover={() => switchView('discover')} />{detailOverlay}</> : view === 'settings' ? <SettingsPage prospects={prospects} audits={audits} businesses={searchSource} onMessage={setToast} onScan={scanWebsites} onShowRated={showRated} /> : view === 'today' ? <><Today prospects={prospects} shortlist={shortlist} candidates={candidates} reviewQueue={reviewQueue} followups={followups} onSelect={setSelectedId} onDiscover={() => switchView('discover')} onMessage={setToast} audits={audits} onSetup={openReviewSetup} />{detailOverlay}</> : <>

      <section className="search-workspace" aria-label="Search and filter businesses">
        <div className="search-heading"><h2>Find local businesses</h2></div>
        <form className="search-bar" onSubmit={submitSearch}>
          <LocationSearch value={mapProposal?.center.label || locationText} selectedLabel={mapProposal?.center.label || center.label} nearby={locationBias} disabled={busy || geoBusy} inputRef={searchRef} actionsRef={locationActionsRef} onChange={text => { setMapProposal(null); setLocationText(text); }} onSelect={chooseArea} onLocate={locate} />
          <div className="radius-group"><label htmlFor="radius">Radius <span>{radius} km</span></label><div className="range-wrap"><input id="radius" disabled={busy || geoBusy} type="range" min="0.5" max="10" step="0.5" value={radius} onChange={e => { setRadius(Number(e.target.value)); setSelectedId(null); }} aria-valuetext={`${radius} kilometers radius`} /><button type="button" className="icon-button" onClick={previewArea} aria-label="Preview search area on map" title="Preview search area"><MapIcon size={17} /></button></div></div>
          <div className="category-group"><label htmlFor="category">Business type</label><div className="select-wrap"><Building2 size={17} /><select id="category" value={filters.category} onChange={e => f('category', e.target.value)}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select><ChevronDown size={15} /></div></div>
          <button className="primary search-button" disabled={busy || geoBusy}><Search size={17} />{geoBusy ? 'Finding location…' : busy ? 'Searching…' : mapProposal ? 'Confirm search' : 'Search area'}</button>
        </form>
        <div className="filter-bar">
          <label className="filter-chip"><input type="checkbox" checked={filters.noWebsite} onChange={e => f('noWebsite', e.target.checked)} />No dedicated website</label>
          <label className="filter-chip"><input type="checkbox" checked={filters.independent} onChange={e => f('independent', e.target.checked)} />No chain recorded</label>
          <button className={`text-button more-filters ${advanced ? 'active' : ''}`} aria-expanded={advanced} aria-controls="advanced-filters" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={15} />Filters{extraFilterCount > 0 && <span className="tiny-count">{extraFilterCount}</span>}</button>
          {filtersChanged && <button className="text-button reset-filters" onClick={() => setFilters({ ...initialFilters, independent: view !== 'saved' })}>Reset</button>}
        </div>
        {advanced && <div id="advanced-filters" className="advanced-filters">
          <label className="filter-chip"><input type="checkbox" checked={filters.contact} onChange={e => f('contact', e.target.checked)} />Contact available</label>
          <label htmlFor="priority">Minimum priority <strong>{filters.minScore}</strong><input id="priority" type="range" min="0" max="100" step="5" value={filters.minScore} onChange={e => f('minScore', Number(e.target.value))} /></label>
          <label htmlFor="technology">Website technology<select id="technology" value={filters.technology} onChange={e => f('technology', e.target.value)}><option value="all">Any technology</option>{['WordPress', 'Shopify', 'Wix', 'Squarespace', 'Webflow', 'Framer', 'Joomla', 'Drupal'].map(t => <option key={t}>{t}</option>)}</select></label>
          <label htmlFor="status">Lead status<select id="status" value={filters.status} onChange={e => f('status', e.target.value)}><option value="all">Any status</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>
        </div>}
      </section>

      {error && <div className="error-banner" role="alert"><Info size={18} /><span>{error}{result && ' Your previous results are still shown.'}</span><button onClick={() => runSearch()} disabled={busy} className="text-button">Retry</button><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}

      <AuditControls audits={audits} businesses={searchSource} busy={busy || prospects.running} onScan={scanWebsites} onShowRated={showRated} expanded={reviewsExpanded} onToggle={() => setReviewsExpanded(!reviewsExpanded)} toggleRef={reviewToggleRef} />

      <div className="mobile-view-switch" aria-label="Results view"><button className={mobileView === 'list' ? 'active' : ''} aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}><List size={16} />List</button><button className={mobileView === 'map' ? 'active' : ''} aria-pressed={mobileView === 'map'} onClick={() => setMobileView('map')}><MapIcon size={16} />Map</button></div>
      <section className={`results-workspace mobile-${mobileView} ${selected ? 'has-selection' : ''}`} aria-label="Search results">
        <aside className="results-panel">
          <div className="results-heading"><h2>{view === 'saved' ? 'Saved leads' : 'Businesses'}<span>{busy ? 'Searching…' : businesses.length}</span></h2><button className="icon-button export-button" disabled={!businesses.length || busy} onClick={exportCsv} title="Export visible results as CSV" aria-label="Export visible results as CSV"><Download size={18} /></button></div>
          <div className="list-tools">
            <div className="list-search"><Search size={15} /><input aria-label="Filter results by name or category" placeholder="Find in results" value={filters.query} onChange={e => f('query', e.target.value)} /></div>
            <div className="results-sort" title={activeSort.label}>
              <span className="results-sort-label" aria-hidden="true"><SortIcon size={15} /><span>Sort: {activeSort.shortLabel}</span><ChevronDown size={13} /></span>
              <select aria-label="Sort results" value={filters.sort} onChange={e => f('sort', e.target.value)}>
                {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
          <div className="business-list" aria-busy={busy}>
            {busy ? <div className="loading-list" role="status"><span className="sr-only">Searching for businesses</span>{[1, 2, 3, 4, 5].map(i => <div className="skeleton-row" key={i}><div className="skeleton square" /><div><div className="skeleton wide" /><div className="skeleton short" /><div className="skeleton medium" /></div></div>)}</div> : businesses.length ? <>{businesses.slice(0, pageSize).map((b, index) => <article key={b.id} className={`business-row ${selectedId === b.id ? 'selected' : ''}`}><button className="business-select" onClick={() => setSelectedId(b.id)} aria-label={`View ${b.name}, ${b.kind}, priority ${b.score}, ${auditResultLabel(b, audits.job)}`}><span className="rank">{String(index + 1).padStart(2, '0')}</span><BusinessThumbnail business={b} /><div className="business-summary"><div className="business-title"><h3>{b.name}</h3><span className={`score ${scoreClass(b.score)}`} title="Sales priority out of 100; open details for the reasons">{b.score}</span></div><div className="business-meta"><BusinessTypeLabel business={b} /><span>{formatDistance(b.distance)}</span></div><div className="business-signals">{!b.audit && <span className="website-tag">{WEBSITE_LABELS[b.websiteStatus]}</span>}<AuditBadge business={b} job={audits.job} /></div><div className="business-quote"><strong>{money(b.prospect.price.suggested, b.prospect.price.currency)}</strong><span>estimate · excl. VAT</span></div>{view === 'saved' && saved[b.id] && <div className="saved-status">{saved[b.id].status}</div>}</div></button><button className={`save-icon ${saved[b.id] ? 'is-saved' : ''}`} onClick={() => toggleSave(b)} aria-label={saved[b.id] ? `Unsave ${b.name}` : `Save ${b.name}`} title={saved[b.id] ? 'Remove from saved leads' : 'Save lead'}><Bookmark size={16} fill={saved[b.id] ? 'currentColor' : 'none'} /></button></article>)}{pageSize < businesses.length && <button className="load-more secondary" onClick={() => setPageSize(n => n + 60)}>Show more businesses ({businesses.length - pageSize})</button>}</> : <div className="empty-state"><div className="empty-icon">{view === 'saved' ? <Bookmark size={28} /> : <Search size={28} />}</div><h3>{view === 'saved' && !savedCount ? 'No saved leads yet' : result ? 'No matching businesses' : 'Search for local businesses'}</h3><p>{view === 'saved' && !savedCount ? 'Bookmark a business to keep it here with your notes.' : result ? 'Try another business type, clear a filter, or expand your search radius.' : 'Choose a location and radius to get started.'}</p><button className="secondary" onClick={() => view === 'saved' && !savedCount ? switchView('discover') : result ? setFilters({ ...initialFilters, noWebsite: false, independent: false }) : runSearch()}>{view === 'saved' && !savedCount ? 'Explore businesses' : result ? 'Clear filters' : 'Search this area'}<ArrowRight size={15} /></button></div>}
          </div>
          <div className="list-footer"><button onClick={showHelp}>About these results<ArrowUpRight size={12} /></button><span>OpenStreetMap</span></div>
        </aside>

        <div ref={mapPanelRef} className="map-panel"><Suspense fallback={<div className="map-loading">Loading your map…</div>}><BusinessMap center={activeCenter} radius={radius} businesses={businesses} selectedId={selectedId} onSelect={setSelectedId} onMove={setMapPosition} fitToken={fitToken} confirming={!!mapProposal} /></Suspense>
          {(areaChanged || mapProposal) && <div className={`map-location ${mapProposal ? 'confirming-area' : ''}`}><div><strong>{mapProposal ? 'Search this area?' : 'Search area changed'}</strong><p>{mapProposal ? `${radius} km radius. Confirm to update results.` : result ? 'Search again to update the results.' : 'Choose Search area to find businesses.'}</p>{mapProposal && <div className="area-confirmation" role="group" aria-label="Confirm new search area"><button ref={confirmAreaRef} className="primary" disabled={busy || geoBusy} onClick={() => runSearch()}>Confirm search</button><button className="text-button" onClick={cancelMapProposal}>Cancel</button></div>}</div></div>}
          {!selected && !busy && browsingElsewhere && <button className="search-map secondary" disabled={geoBusy} onClick={proposeMapArea}><Search size={15} />{mapProposal ? 'Move preview here' : 'Search this area'}</button>}
          {!selected && !busy && !browsingElsewhere && !mapProposal && areaChanged && <button className="search-map primary" disabled={geoBusy} onClick={() => runSearch()}><Search size={15} />Search {radius} km radius</button>}
          <button className="fit-map icon-button" title="Fit search radius" aria-label="Fit search radius" onClick={() => setFitToken(n => n + 1)}><LocateFixed size={19} /></button>
          <div className="map-legend"><span>Priority</span><span><i className="high" />70–100</span><span><i className="medium" />45–69</span><span><i className="low" />0–44</span><button onClick={showHelp} aria-label="Explain priority"><Info size={14} /></button></div>
          {busy && <div className="map-busy"><span className="loading-dot" />Searching local businesses…</div>}
          {selected && <BusinessDetails onSettings={() => switchView('settings')} key={selected.id} business={selected} savedLead={saved[selected.id]} audits={audits} statuses={statuses} panelRef={inspectorRef} researchLocation={(result?.center || center).label} prospects={prospects} onSave={patch => saveBusiness(selected, patch)} onToggleSave={() => toggleSave(selected)} onReviewSetup={openReviewSetup} onClose={() => setSelectedId(null)} />}
        </div>
      </section>
      <div className="workspace-footer"><span>Listings may be incomplete. Verify before contacting.</span><span>{busy ? 'Searching…' : result ? `Updated ${timeLabel(result.fetchedAt)}` : ''}{searchChanged && result && <span className="pending-search"> · Area not updated</span>}</span></div>
      </>}
      
    </main>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    <dialog ref={helpRef} className="help-dialog" onClose={() => setHelpOpen(false)} onClick={e => { if (e.target === helpRef.current) helpRef.current.close(); }}><div className="dialog-heading"><h2>How ranking works</h2><button className="icon-button" aria-label="Close explanation" onClick={() => helpRef.current.close()}><X size={20} /></button></div>{helpOpen && <><p>Sales priority combines verified identity and contact (25), a specific opportunity (up to 30), fit with your offer and niche (20), contact availability (10), estimated project size fit (up to 10), and local ownership signals (5, or ?20 for a recorded chain). Scores are capped at 100 and are not purchase probabilities.</p><p>Today shows up to 10 prospects with recent verification, a contact channel and a specific opportunity. Missing listing data alone does not qualify a business. Follow-ups and exclusions are remembered across searches.</p><h3>Website prices</h3><p>Every business gets a suggested one-time project quote, excluding VAT. Niche-specific scope and estimated delivery hours are multiplied by your hourly rate and minimum fee. Change the market, currency, rate and target in Settings, or adjust an individual quote in business details. Published German packages are reference points; estimates do not establish a client?s budget.</p><h3>AI website reviews</h3><p>Choose Rate websites to review every unique dedicated website in your last search, including results hidden by filters. Your locally signed-in Codex or Claude subscription reviews desktop and mobile homepage captures, metadata and passive security observations. Reviews use your subscription allowance and can take a few minutes per website.</p><p>Website quality runs from 0 to 100; higher is better. Weakest website sorts the lowest quality scores first. Quality combines UI (30%), SEO (25%), safety (20%), accessibility (15%) and performance (10%). AI findings need verification; the safety score is not a vulnerability test or a guarantee. Missing and social-only websites are not given invented ratings. Reports are saved locally and included in CSV exports.</p><h3>Know what the data can tell you</h3><p>OpenStreetMap is community maintained. Business coverage and contact details can be incomplete or out of date. “No website listed” means no website appears in this source. “No chain recorded” does not verify independent ownership. Every returned, matching business has a map marker; the search cannot guarantee every business in the area.</p><h3>Your work stays with you</h3><p>Saved leads and your prospect preferences are kept in this browser and backed up by the connected local service. Settings includes JSON backup and restore; CSV exports include your quotes and follow-up fields. The last area search stays in this browser. Searches and map requests go to the public mapping services. Website reviews send public page observations and screenshots to your selected AI provider through its local CLI.</p><p className="small-muted">Location search: Photon. Business listings: Overpass / OpenStreetMap. These community services may be slow or temporarily unavailable.</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL license<ArrowUpRight size={14} /></a></>}</dialog>
  </div></BusinessImagesProvider>;
}
