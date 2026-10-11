import { useState, useRef } from 'react';
import { ArrowRight, Check, Download, Search, Settings2, Square, Upload, RefreshCw, Phone, CalendarClock, CircleAlert, ChevronDown, ShieldCheck, Clock3, Pencil, Info, Inbox } from 'lucide-react';
import { CATEGORIES } from './model.mjs';
import { money, dayKey, addDays, cleanProfile } from './prospect-model.mjs';
import BusinessThumbnail from './BusinessThumbnail.jsx';
import BusinessTypeLabel from './BusinessTypeLabel.jsx';
import { recordedUsage, formatTokens } from './scan-usage.mjs';
import './prospects.css';
import './today.css';

export function Profile({ prospects, onMessage, defaultOpen = false }) {
  const [draft, setDraft] = useState(prospects.settings), fileRef = useRef(null);
  const field = (name, value) => setDraft(old => ({ ...old, [name]: value }));
  async function restore(e) { const file = e.target.files?.[0]; if (!file) return; try { const count = await prospects.importBackup(file); onMessage(`${count} leads merged from backup`); } catch (error) { onMessage(error.message); } e.target.value = ''; }
  return <details className="prospect-settings" open={defaultOpen || undefined}>
    <summary onClick={e => { if (!e.currentTarget.parentElement.open) setDraft(prospects.settings); }}><Settings2 size={16} /><span>Preferences & backup</span><ChevronDown size={15} /></summary>
    <form onSubmit={e => { e.preventDefault(); prospects.saveProfile(cleanProfile(draft)); onMessage('Your prospect and pricing preferences are saved'); }}>
      <div className="profile-grid">
        <label>Market<input value={draft.market} maxLength={80} onChange={e => field('market', e.target.value)} required /></label>
        <label>Currency<select value={draft.currency} onChange={e => field('currency', e.target.value)}>{['EUR', 'GBP', 'USD', 'CHF'].map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Your hourly rate<input type="number" min="15" max="300" value={draft.rate} onChange={e => field('rate', e.target.value)} required /></label>
        <label>Minimum project fee<input type="number" min="0" max="50000" step="50" value={draft.minimumProject} onChange={e => field('minimumProject', e.target.value)} required /></label>
        <label>Target project value<input type="number" min="0" max="100000" step="50" value={draft.targetPrice} onChange={e => field('targetPrice', e.target.value)} required /></label>
        <label>Preferred niche<select value={draft.preferredCategory} onChange={e => field('preferredCategory', e.target.value)}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label>Your offer<select value={draft.offer} onChange={e => field('offer', e.target.value)}>{['Websites & redesigns', 'New websites', 'Redesigns'].map(o => <option key={o}>{o}</option>)}</select></label>
      </div>
      <div className="profile-footer"><p>Quotes use your rate and scope, excluding VAT. Client budgets are unknown.</p><button className="primary">Save preferences</button></div>
    </form>
    <div className="backup-actions"><span>{prospects.storage}</span><button className="text-button" onClick={prospects.exportBackup}><Download size={14} />Download backup</button><button className="text-button" onClick={() => fileRef.current?.click()}><Upload size={14} />Restore backup</button><button className="text-button" onClick={prospects.retry}><RefreshCw size={14} />Retry local backup</button><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={restore} /></div>
  </details>;
}
function opportunityTitle(b, lead) {
  if (lead?.opportunity?.trim()) return lead.opportunity.trim();
  if (b.prospect.verified && lead?.verification?.presence === 'no-website') return 'No dedicated website';
  if (b.prospect.verified && b.websiteStatus === 'social') return 'Social profile only';
  return b.prospect.finding?.title || b.prospect.reason;
}

function ProspectRow({ business: b, lead, onSelect, prospects }) {
  const p = b.prospect;
  const overdue = lead?.nextDate && lead.nextDate < dayKey();
  return <article className="today-row" aria-label={b.name}>
    <div className="today-row-main">
      <button className="today-business" onClick={() => onSelect(b.id)} aria-label={`View ${b.name}`}>
        <BusinessThumbnail business={b} />
        <span><strong>{b.name}</strong><BusinessTypeLabel business={b} /></span>
      </button>
      <div className="today-opportunity"><p>{opportunityTitle(b, lead)}</p><span className={overdue || !p.verified ? 'today-attention' : ''}>
        {overdue ? <><Clock3 size={13} />Overdue · {new Date(lead.nextDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</> : p.verified ? <><ShieldCheck size={13} />{p.contactLabel}</> : <><CircleAlert size={13} />{p.contactLabel}</>}
      </span></div>
      <div className="today-quote" aria-label={`${p.price.custom ? 'Your quote' : 'Suggested quote'} ${money(p.price.suggested, p.price.currency)}, excluding VAT`}>
        <strong>{money(p.price.suggested, p.price.currency)}</strong>{p.price.custom ? <span><Pencil size={11} />Your quote</span> : <span className="quote-mobile-label">Suggested quote</span>}
      </div>
      <button className="secondary today-review" onClick={() => onSelect(b.id)} aria-label={`Review ${b.name}`}>Review<ArrowRight size={14} /></button>
    </div>
    <details className="today-row-details">
      <summary><span>Offer & next step</span><ChevronDown size={13} /></summary>
      <div className="today-row-expanded">
        <dl><div><dt>Opportunity</dt><dd>{p.reason}</dd></div><div><dt>Offer</dt><dd>{p.offer}</dd></div><div><dt>Next step</dt><dd>{p.nextAction}</dd></div></dl>
        <div className="today-row-footer"><span>Sales priority {p.score}/100</span><div><button className="secondary" onClick={() => prospects.contacted(b)} title="Record contact and schedule follow-up in 3 days"><Check size={15} />Mark contacted</button><button className="text-button" onClick={() => prospects.saveBusiness(b, { nextDate: addDays(1), completedDate: '', nextAction: lead?.nextAction || p.nextAction })}><CalendarClock size={15} />Move to tomorrow</button></div></div>
      </div>
    </details>
  </article>;
}

function ResearchActivity({ prospects, canStart, provider }) {
  const job = prospects.job;
  if (!job) return null;
  const completed = job.items.filter(item => item.status === 'completed').length;
  const active = job.items.find(item => ['researching', 'reviewing'].includes(item.status));
  const usage = recordedUsage(job.items);
  const unfinished = job.items.filter(item => item.status !== 'completed');
  if (prospects.running) return <div className="today-research-progress" role="status">
    <Search size={18} aria-hidden="true" /><div><strong>Researching {completed}/{job.items.length}</strong><p>{active ? `${active.status === 'reviewing' ? 'Reviewing' : 'Looking up'} ${active.name}` : 'Preparing the next business…'}</p><progress value={completed} max={Math.max(1, job.items.length)} aria-label="Research progress" /></div><button className="text-button" onClick={prospects.cancel}><Square size={13} />Stop</button>
  </div>;
  return <details className="today-run" open={job.status === 'failed' || !!job.error || !!job.warning || undefined}>
    <summary><Info size={14} /><span>{job.status === 'failed' ? 'Research interrupted' : job.status === 'cancelled' ? 'Research stopped' : 'Last research'} · {completed}/{job.items.length} completed{usage ? ` · ${formatTokens(usage.total)} tokens` : ''}</span><ChevronDown size={14} /></summary>
    <div>{job.error && <p className="prospect-error" role="alert">{job.error}</p>}{job.warning && <p className="prospect-error">{job.warning}</p>}{usage && <p>Recorded across {usage.count} businesses. Incomplete attempts may use additional allowance.</p>}
      {unfinished.length > 0 && <><ul>{unfinished.map(item => <li key={item.business?.id || item.name}><strong>{item.name || item.business?.name}</strong>{item.error && <span>{item.error}</span>}</li>)}</ul><button className="secondary" disabled={!canStart} onClick={() => prospects.start(unfinished.map(item => item.business), provider)}><RefreshCw size={14} />Retry unfinished</button></>}
    </div>
  </details>;
}

function QueueEmpty({ icon: Icon, title, children, action }) {
  return <div className="today-empty"><Icon size={30} strokeWidth={1.5} aria-hidden="true" /><h2>{title}</h2><p>{children}</p>{action}</div>;
}

export default function Today({ prospects, shortlist, candidates, reviewQueue, followups, onSelect, onDiscover, onMessage, audits, onSetup }) {
  const [chosenQueue, setChosenQueue] = useState(null);
  const ready = !!audits.connection?.providers?.[audits.provider]?.ready;
  const canStart = ready && !audits.running && !prospects.running && !prospects.submitting;
  const targets = candidates.slice(0, 10);
  const queue = chosenQueue || (shortlist.length ? 'contact' : followups.length ? 'followups' : reviewQueue.length ? 'review' : 'research');
  const queues = [
    { id: 'contact', label: 'Ready to contact', short: 'Contact', count: shortlist.length, icon: Phone },
    { id: 'followups', label: 'Follow-ups', short: 'Follow-ups', count: followups.length, icon: CalendarClock },
    { id: 'research', label: 'Research', short: 'Research', count: targets.length, icon: Search },
    { id: 'review', label: 'Needs review', short: 'Review', count: reviewQueue.length, icon: CircleAlert },
  ];
  const rows = queue === 'contact' ? shortlist : followups;
  const provider = audits.provider === 'claude' ? 'Claude' : 'Codex';
  const openQueue = id => setChosenQueue(id);
  function tabKey(e) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const index = queues.findIndex(item => item.id === queue);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? queues.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + queues.length) % queues.length;
    setChosenQueue(queues[next].id);
    e.currentTarget.querySelectorAll('[role=tab]')[next].focus();
  }
  return <section className="today-workspace" aria-label="Daily prospect shortlist">
    <header className="today-heading"><div><h1>Today</h1><p>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div><button className="secondary" onClick={onDiscover}><Search size={15} />Find businesses</button></header>
    {prospects.error && <div className="prospect-notice" role="alert"><CircleAlert size={17} /><span>{prospects.error}</span><button className="text-button" onClick={prospects.retry}>Retry connection</button></div>}
    <div className="today-tabs" role="tablist" aria-label="Prospect queues" onKeyDown={tabKey}>
      {queues.map(({ id, label, short, count, icon: Icon }) => <button key={id} role="tab" id={`today-tab-${id}`} aria-label={`${label} (${count})`} aria-controls="today-queue" aria-selected={queue === id} tabIndex={queue === id ? 0 : -1} onClick={() => openQueue(id)}><Icon size={17} aria-hidden="true" /><span className="queue-label-full">{label}</span><span className="queue-label-short" aria-hidden="true">{short}</span><span className="queue-count">{count}</span></button>)}
    </div>
    {prospects.running && <ResearchActivity prospects={prospects} canStart={canStart} provider={audits.provider} />}
    <div id="today-queue" className={`today-queue queue-${queue}`} role="tabpanel" aria-labelledby={`today-tab-${queue}`} tabIndex={0}>
      {(queue === 'contact' || queue === 'followups') && (rows.length ? <>
        <div className="today-table"><div className="today-table-head" aria-hidden="true"><span>Business</span><span>Opportunity</span><span>Quote · excl. VAT</span><span /></div>{rows.map(b => <ProspectRow key={b.id} business={b} lead={prospects.saved[b.id]} prospects={prospects} onSelect={onSelect} />)}</div>
        <p className="today-footnote">{queue === 'contact' ? 'Up to 10 verified prospects. ' : ''}Quotes are suggested unless edited, excluding VAT.</p>
      </> : <QueueEmpty icon={queue === 'contact' ? Phone : CalendarClock} title={queue === 'contact' ? 'No prospects ready yet' : 'No follow-ups due'} action={<button className="secondary" onClick={() => openQueue(queue === 'contact' ? 'research' : 'contact')}>{queue === 'contact' ? 'Research candidates' : 'View ready prospects'}<ArrowRight size={14} /></button>}>{queue === 'contact' ? 'Research a business to check its contact details and website opportunity.' : 'Your scheduled conversations will appear here.'}</QueueEmpty>)}
      {queue === 'research' && <>
        {(targets.length > 0 || prospects.running) && <div className="today-queue-toolbar"><p>Check contact details and website opportunities.</p><div className="research-start">{ready ? <button className="primary" disabled={!canStart || !targets.length} onClick={() => prospects.start(targets, audits.provider)}><Search size={15} />{prospects.submitting ? 'Starting…' : prospects.running ? 'Researching…' : `Research ${targets.length} businesses`}</button> : <button className="primary" onClick={onSetup}>Connect subscription<ArrowRight size={15} /></button>}<span>{provider} · uses subscription allowance</span></div></div>}
        {targets.length ? <div className="today-candidates"><div className="today-candidate-head" aria-hidden="true"><span>Business</span><span>Quote · excl. VAT</span><span /></div>{targets.map(b => <button key={b.id} className="research-candidate" onClick={() => onSelect(b.id)} aria-label={`Review ${b.name}, ${b.prospect.price.custom ? 'your quote' : 'suggested quote'} ${money(b.prospect.price.suggested, b.prospect.price.currency)}, excluding VAT`}><span className="research-candidate-name"><BusinessThumbnail business={b} /><span><strong>{b.name}</strong><BusinessTypeLabel business={b} /></span></span><span className="candidate-quote">{b.prospect.price.custom && <Pencil size={12} aria-hidden="true" />}{money(b.prospect.price.suggested, b.prospect.price.currency)}</span><ArrowRight size={16} /></button>)}</div> : !prospects.running && <QueueEmpty icon={Search} title="Find your next prospect" action={<button className="secondary" onClick={onDiscover}>Search an area<ArrowRight size={14} /></button>}>Search another area to add businesses to research.</QueueEmpty>}
        {targets.length > 0 && <p className="today-footnote">Quotes are suggested unless edited. Research takes a few minutes per business.</p>}
        {!prospects.running && <ResearchActivity prospects={prospects} canStart={canStart} provider={audits.provider} />}
      </>}
      {queue === 'review' && (reviewQueue.length ? <><div className="today-queue-toolbar"><p>Confirm the missing details to qualify these businesses.</p></div><div className="today-candidates review-candidates">{reviewQueue.map(b => <button key={b.id} className="research-candidate" onClick={() => onSelect(b.id)} aria-label={`Review ${b.name}`}><span className="research-candidate-name"><BusinessThumbnail business={b} /><span><strong>{b.name}</strong><BusinessTypeLabel business={b} /></span></span><span className="review-candidate-state"><CircleAlert size={14} />{b.prospect.verified ? 'Check opportunity' : 'Check identity & contact'}</span><ArrowRight size={16} /></button>)}</div></> : <QueueEmpty icon={Inbox} title="Nothing to review">Businesses needing a manual check will appear here.</QueueEmpty>)}
    </div>
  </section>;
}
