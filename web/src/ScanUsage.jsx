import { Info } from 'lucide-react';
import { estimateScanTokens, formatTokens, quotaWindowLabel } from './scan-usage.mjs';

export default function ScanUsage({ audits, count }) {
  const estimate = estimateScanTokens(count, audits.reports, audits.provider);
  const quota = audits.connection?.providers?.[audits.provider]?.quota;
  const windows = quota?.windows?.filter(window => !window.resetsAt || window.resetsAt > Date.now()) || [];
  return <div className="scan-usage" aria-label="Scan usage estimate">
    <div className="scan-estimate"><span>Estimated tokens · all {count} {count === 1 ? 'website' : 'websites'}</span><strong>{count ? `${formatTokens(estimate.low)}–${formatTokens(estimate.high)}` : '—'}</strong><small>{!count ? 'Search an area to estimate usage.' : estimate.samples ? `Based on ${estimate.samples} saved ${audits.provider === 'codex' ? 'Codex' : 'Claude'} ${estimate.samples === 1 ? 'review' : 'reviews'}. Actual usage varies.` : 'Rough planning range · no scan history yet.'}</small></div>
    <div className="scan-quota"><span>Subscription remaining</span>{windows.length ? <div className="quota-windows">{windows.map(window => <div className="quota-window" key={window.key}><div><span>{quotaWindowLabel(window.windowMinutes, window.key)}</span><strong>{Math.round(window.remainingPercent)}%</strong></div><meter min="0" max="100" value={window.remainingPercent} aria-label={`${quotaWindowLabel(window.windowMinutes, window.key)} allowance remaining`} /><small>{window.resetsAt ? `Resets ${new Date(window.resetsAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Reset time unavailable'}</small></div>)}</div> : <><strong className="quota-unavailable">{audits.loading ? 'Checking…' : 'Unavailable'}</strong><small>{audits.provider === 'claude' ? 'Claude does not expose remaining allowance here.' : 'Refresh to check your connected account.'}</small></>}</div>
    <details className="scan-usage-note"><summary><Info size={13} />Why no percentage for this scan?</summary><p>Subscription allowance is not a token balance, so this scan’s share of the remaining quota cannot be calculated reliably. The estimate includes page content, two screenshots and the response; model, page size, caching and reasoning affect usage. Actual usage can fall outside this range. {quota?.checkedAt && `Allowance checked at ${new Date(quota.checkedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`} Recorded tokens appear after each completed review.</p></details>
  </div>;
}
