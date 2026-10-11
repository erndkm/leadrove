import { useState } from 'react';
import { ScanLine, RefreshCw, Square, ArrowUpRight, Info, ChevronDown, MousePointer2, Search, Shield, Accessibility, Gauge, BarChart3, Monitor, Smartphone, Check, CircleAlert } from 'lucide-react';
import { AUDIT_CATEGORIES, auditKey, qualityLabel } from './audit-model.mjs';
import './audits.css';
import ScanUsage from './ScanUsage.jsx';
import { formatTokens, recordedUsage } from './scan-usage.mjs';
import { mobileChecks } from './mobile-checks.mjs';
import { safeUrl } from './model.mjs';

const providerName = provider => provider === 'claude' ? 'Claude' : 'Codex';
const stamp = value => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AuditControls({ audits, businesses, busy, onScan, onShowRated, expanded, onToggle, toggleRef }) {
  const [token, setToken] = useState('');
  const websites = new Set(businesses.filter(b => b.websiteStatus === 'website' && b.website).map(b => auditKey(b.website) || b.website));
  const rated = [...websites].filter(url => audits.reports[url]).length;
  const items = audits.job?.items || [];
  const completed = items.filter(item => item.status === 'completed').length;
  const failed = items.filter(item => item.status === 'failed').length;
  const stopped = items.filter(item => item.status === 'cancelled').length;
  const current = items.find(item => ['capturing', 'reviewing'].includes(item.status));
  const usage = recordedUsage(items);
  return <section className="audit-workspace" aria-labelledby="audit-title">
    <button className="audit-toggle" ref={toggleRef} aria-expanded={expanded} aria-controls="audit-content" onClick={onToggle}>
      <span className="scan-title"><ScanLine size={19} aria-hidden="true" /><span id="audit-title">Website scan</span></span>
      <span className="audit-toggle-status" role="status">{audits.running ? `${completed + failed} of ${items.length} reviewed` : rated > 0 ? `${rated} rated` : audits.loading ? 'Connecting…' : audits.ready ? `${websites.size} websites available` : 'Set up'}</span>
      <span className="scan-toggle-action">{expanded ? 'Close' : 'Review & scan'}<ChevronDown size={15} /></span>
    </button>
    <div id="audit-content" className="audit-content" hidden={!expanded}>
    <div className="audit-toolbar">
      <div className="audit-intro"><h3>Find websites worth improving</h3><p>All unique websites in your search, including filtered results.</p><div className="scan-scope"><span><Monitor size={14} />Desktop</span><span><Smartphone size={14} />Mobile</span><span><Search size={14} />SEO</span><span><Shield size={14} />Safety</span></div></div>
      <div className="audit-actions"><label className="sr-only" htmlFor="audit-provider">AI subscription</label><select id="audit-provider" value={audits.provider} disabled={audits.running || audits.submitting} onChange={e => audits.chooseProvider(e.target.value)}><option value="codex">Codex subscription</option><option value="claude">Claude subscription</option></select>
        <button className="primary" disabled={!websites.size || busy || audits.running || audits.submitting || !audits.ready} onClick={onScan}><ScanLine size={16} />{audits.submitting ? 'Starting…' : audits.running ? 'Scanning…' : `Scan all ${websites.size} websites`}</button>
      </div>
    </div>
    <ScanUsage audits={audits} count={websites.size} />
    <div className="audit-meta"><span>{audits.loading ? 'Checking subscription connection…' : audits.ready ? `${providerName(audits.provider)} connected` : 'Connect your subscription to review websites'}</span><div>{rated > 0 && <button className="text-button" onClick={onShowRated}>Weakest websites first<ArrowUpRight size={13} /></button>}<button className="text-button" onClick={() => audits.refresh(true)} disabled={audits.loading || audits.running}><RefreshCw size={13} />Refresh usage</button></div></div>
    {(!audits.ready && !audits.loading) && <details className="audit-setup"><summary>Set up website reviews</summary><p>{audits.connection && !audits.connection.browser ? 'Install the browser with npm run audit:setup, then refresh connection.' : audits.connection?.providers?.[audits.provider]?.message || 'Run Leadrove locally to use the subscription signed in on your computer.'}</p><ol><li>Install and sign in to {providerName(audits.provider)}: <code>{audits.provider === 'codex' ? 'codex login' : 'claude auth login'}</code>.</li><li>In this project, run <code>npm run audit:setup</code>, then <code>npm run dev</code>.</li><li>Open <a href="http://127.0.0.1:5173" target="_blank" rel="noreferrer">the local workspace<ArrowUpRight size={12} /></a> and expand Website scan, then choose Scan all websites.</li></ol>{!audits.local && <details><summary>Connect this hosted page to your computer</summary><p>Set <code>CLIENTFINDER_ALLOWED_ORIGIN</code> in the server environment to this page's exact HTTPS origin, then run <code>npm run build</code> and <code>npm start</code>. Paste the local connection token from <code>.clientfinder/connection-token</code>. Allow local network access if your browser asks. No account password or API key is needed.</p><form className="audit-pairing" onSubmit={e => { e.preventDefault(); audits.connect(token); setToken(''); }}><label htmlFor="audit-token">Local connection token</label><input id="audit-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} required /><button className="secondary">Connect</button></form></details>}</details>}
    {audits.error && <p className="audit-error" role="alert"><Info size={15} />{audits.error}</p>}
    {usage && <p className="scan-recorded">{formatTokens(usage.total)} tokens recorded <span>across {usage.count} {usage.count === 1 ? 'review' : 'reviews'} in this scan{usage.count < completed ? ' · partial usage data' : ''}{failed || stopped ? ' · incomplete attempts may use additional tokens' : ''}</span></p>}
    {audits.job && <div className="audit-progress"><div role="status" aria-live="polite"><strong>{audits.running ? `${completed + failed} of ${items.length} reviewed` : audits.job.status === 'cancelled' ? 'Scan stopped' : audits.job.status === 'failed' ? 'Scan interrupted' : 'Scan finished'}</strong><span>{audits.running && current ? `${current.status === 'capturing' ? 'Capturing' : 'Rating'} ${current.name}` : `${completed} rated · ${failed} failed${stopped ? ` · ${stopped} not reviewed` : ''}`}</span></div>{audits.running && <><progress value={completed + failed} max={items.length} aria-label="Website review progress" /><button className="text-button" onClick={audits.cancel}><Square size={12} />Stop scan</button></>}{audits.job.error && <p className="audit-error">{audits.job.error}</p>}{audits.job.warning && <p className="audit-error">{audits.job.warning}</p>}{!audits.running && (failed + stopped > 0) && <details className="audit-failures"><summary>Review unsuccessful websites</summary><ul>{items.filter(item => item.status !== 'completed').map(item => <li key={item.website}><strong>{item.name}</strong><span>{item.error || 'Not reviewed because the scan stopped.'}</span></li>)}</ul><button className="secondary" disabled={!audits.ready || audits.submitting} onClick={() => audits.start(items.filter(item => item.status !== 'completed').map(item => ({ ...item, websiteStatus: 'website' })))}>Retry unsuccessful websites</button></details>}</div>}
    </div>
  </section>;
}

export function AuditBadge({ business, job }) {
  const item = job?.items.find(item => item.website === auditKey(business.website));
  const report = business.audit;
  if (item && ['capturing', 'reviewing', 'queued'].includes(item.status) && job.status === 'running') return <span className="audit-row-status">{item.status === 'queued' ? 'Queued for review' : item.status === 'capturing' ? 'Capturing website…' : 'AI reviewing…'}</span>;
  if (report) return <span className={`audit-badge quality-${report.qualityScore < 65 ? 'weak' : 'strong'}`}>Website {report.qualityScore}/100<span>· {qualityLabel(report.qualityScore)}</span></span>;
  if (item?.status === 'failed') return <span className="audit-row-status">Review failed · open for details</span>;
  return null;
}

const categoryIcons = { ui: MousePointer2, seo: Search, safety: Shield, accessibility: Accessibility, performance: Gauge };

function ReviewFinding({ finding }) {
  const Icon = categoryIcons[finding.category] || CircleAlert;
  return <details className="review-finding">
    <summary><Icon size={16} aria-hidden="true" /><span>{finding.title}</span><span className={`review-severity severity-${finding.severity}`}>{finding.severity}</span><ChevronDown size={14} className="detail-chevron" /></summary>
    <dl><div><dt>Observed</dt><dd>{finding.evidence}</dd></div><div><dt>Suggested fix</dt><dd>{finding.recommendation}</dd></div></dl>
  </details>;
}

export function AuditDetails({ business, audits, onSetup }) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const report = business.audit;
  const item = audits.job?.items.find(item => item.website === auditKey(business.website));
  const eligible = business.websiteStatus === 'website' && business.website;
  const reviewing = audits.running && item && ['queued', 'capturing', 'reviewing'].includes(item.status);
  if (!eligible) return null;
  const mobile = mobileChecks(report?.evidence);
  const longSummary = (report?.summary?.length || 0) > 160;
  return <section className="audit-details" aria-label="Website review">
    <div className="audit-detail-heading"><h3>{report ? 'Website quality' : 'Website review'}</h3>{report && <button className="text-button" disabled={!audits.ready || audits.running || audits.submitting} onClick={() => audits.start([business])}><RefreshCw size={13} />Rate again</button>}</div>
    {item?.status === 'failed' && <div className="review-error" role="alert"><CircleAlert size={17} /><div><strong>Review unavailable</strong><p>{item.error}</p>{report && <p>Showing the previous review.</p>}</div></div>}
    {reviewing && <div className="review-pending" role="status"><ScanLine size={20} /><div><strong>{item.status === 'queued' ? 'Queued for review' : item.status === 'capturing' ? 'Capturing the website' : 'Review in progress'}</strong><p>Desktop and mobile · Results appear here.</p></div></div>}
    {!report && !reviewing && <div className="review-empty">
      <Monitor size={24} aria-hidden="true" /><h4>Not reviewed yet</h4><p>A desktop and mobile homepage review.</p>
      {audits.ready ? <button className="secondary" disabled={audits.running || audits.submitting} onClick={() => audits.start([business])}><ScanLine size={15} />{audits.submitting ? 'Starting…' : 'Rate website'}</button> : <><p className="detail-caption">Connect your subscription to start.</p><button className="secondary" onClick={onSetup}>Set up reviews<ArrowUpRight size={14} /></button></>}
    </div>}
    {report && <>
      <div className="review-verdict"><h4>{qualityLabel(report.qualityScore)}</h4><span aria-label={`Website quality: ${report.qualityScore} out of 100`}><strong>{report.qualityScore}</strong><small>/100</small></span></div>
      <div className="review-overall-bar" aria-hidden="true"><span style={{ width: `${report.qualityScore}%` }} /></div>
      <p id="review-summary" className={`review-summary ${longSummary && !summaryExpanded ? 'is-collapsed' : ''}`}>{report.summary}</p>
      {longSummary && <button className="text-button review-read-more" aria-expanded={summaryExpanded} aria-controls="review-summary" onClick={() => setSummaryExpanded(!summaryExpanded)}>{summaryExpanded ? 'Show less' : 'Read summary'}<ChevronDown size={13} /></button>}

      <details className={`detail-disclosure mobile-review mobile-${mobile.status}`}>
        <summary><Smartphone size={17} aria-hidden="true" /><span>Mobile usability</span><strong>{mobile.label}</strong><ChevronDown size={14} className="detail-chevron" /></summary>
        {mobile.checks.length ? <ul>{mobile.checks.map(check => <li key={check.label} className={`mobile-check-${check.status}`}>
          {check.status === 'pass' ? <Check size={15} aria-hidden="true" /> : check.status === 'warn' ? <CircleAlert size={15} aria-hidden="true" /> : <Info size={15} aria-hidden="true" />}
          <div><strong>{check.label}<span className="sr-only">: {check.status === 'pass' ? 'passed' : check.status === 'warn' ? 'needs attention' : 'not measured'}</span></strong><p>{check.detail}</p></div>
        </li>)}</ul> : <p className="detail-caption">Scan this website again to collect mobile measurements.</p>}
        <p className="detail-caption">Automated layout checks. Touch interactions, menu behavior and full accessibility require a manual review.</p>
      </details>

      {report.findings.length > 0 ? <div className="review-findings">
        <h4>What to improve<span>{report.findings.length}</span></h4>
        {report.findings.slice(0, 3).map((finding, i) => <ReviewFinding key={i} finding={finding} />)}
        {report.findings.length > 3 && <details className="review-more-findings"><summary>{report.findings.length - 3} more {report.findings.length === 4 ? 'finding' : 'findings'}<ChevronDown size={14} className="detail-chevron" /></summary>{report.findings.slice(3).map((finding, i) => <ReviewFinding key={i} finding={finding} />)}</details>}
      </div> : <p className="review-no-findings"><Check size={16} />No specific issues found in this capture.</p>}

      <details className="detail-disclosure review-breakdown">
        <summary><BarChart3 size={17} aria-hidden="true" /><span>Score breakdown</span><ChevronDown size={15} className="detail-chevron" /></summary>
        <p className="detail-caption">Higher scores are better.</p>
        <div className="review-metrics">{Object.entries(AUDIT_CATEGORIES).map(([key, label]) => {
          const Icon = categoryIcons[key];
          const category = report.categories[key];
          return <details className="review-metric" key={key}><summary><Icon size={15} aria-hidden="true" /><span>{label}</span><span className="review-meter" aria-hidden="true"><span style={{ width: `${category.score}%` }} /></span><strong>{category.score}<span className="sr-only"> out of 100</span></strong><ChevronDown size={13} className="detail-chevron" /></summary><p>{category.rationale}</p></details>;
        })}</div>
      </details>
      {report.strengths.length > 0 && <details className="detail-disclosure review-strengths"><summary><Check size={17} aria-hidden="true" /><span>What works well</span><ChevronDown size={15} className="detail-chevron" /></summary><ul>{report.strengths.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
      <details className="detail-disclosure review-scope">
        <summary><Info size={17} aria-hidden="true" /><span>Review details</span><ChevronDown size={15} className="detail-chevron" /></summary>
        <div className="review-devices"><span><Monitor size={15} />Desktop</span><span><Smartphone size={15} />Mobile</span><span>Homepage only</span></div>
        <dl><div><dt>Reviewed</dt><dd>{stamp(report.scannedAt)}</dd></div><div><dt>Provider</dt><dd>{providerName(report.provider)}</dd></div><div><dt>Connection</dt><dd>{report.evidence?.https ? 'HTTPS observed' : 'HTTPS not observed'}{report.evidence?.httpStatus && ` · HTTP ${report.evidence.httpStatus}`}</dd></div></dl>
        <p>{report.usage ? `${report.usage.totalTokens.toLocaleString()} tokens recorded · ${report.usage.inputTokens.toLocaleString()} input · ${report.usage.outputTokens.toLocaleString()} output` : 'Token usage was not recorded for this review.'}</p>
        <p>Weights: UI 30% · SEO 25% · Safety 20% · Accessibility 15% · Performance 10%.</p>
        <ul>{[...new Set([...(report.evidence?.limitations || []), ...report.limitations])].map((text, i) => <li key={i}>{text}</li>)}</ul>
        <p>Passive security observations, not a security audit.</p>
        <a href={safeUrl(report.website)} target="_blank" rel="noopener noreferrer">Reviewed page<ArrowUpRight size={13} /></a>
      </details>
      <p className="review-attribution">AI review · Verify findings before outreach.</p>
    </>}
  </section>;
}

