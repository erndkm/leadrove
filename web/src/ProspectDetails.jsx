import { useState } from 'react';
import { Check, Copy, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import { money, priceRange, outreachDraft, PRICE_SOURCES, addDays } from './prospect-model.mjs';
import { safeUrl, websiteStatus } from './model.mjs';

function VerificationForm({ business: b, lead, onSave, researchHref }) {
  const v = lead?.verification;
  const [draft, setDraft] = useState({ website: v?.website ?? b.website, phone: v?.phone ?? b.phone, email: v?.email ?? b.email, sourceUrl: v?.sourceUrl || b.prospect.research?.sourceUrl || b.website || b.source, presence: v?.presence || (b.websiteStatus === 'missing' ? 'unresolved' : b.websiteStatus), active: v?.active || false, contactChecked: v?.contactChecked || false });
  const [error, setError] = useState('');
  const field = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  function submit(e) {
    e.preventDefault();
    const website = safeUrl(draft.website), sourceUrl = safeUrl(draft.sourceUrl);
    if (!sourceUrl) return setError('Add the public source you checked.');
    if (draft.presence === 'website' && websiteStatus(website) !== 'website') return setError('Enter the official website URL.');
    if (draft.presence === 'social' && websiteStatus(website) !== 'social') return setError('Enter the business’s social profile URL.');
    if (draft.presence === 'unresolved') return setError('Check the online presence before confirming.');
    if (!draft.active || !draft.contactChecked || !(draft.phone.trim() || draft.email.trim())) return setError('Confirm the business is active and add a checked business contact.');
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) return setError('Check the email address, or leave it blank.');
    if (draft.phone && draft.phone.replace(/\D/g, '').length < 6) return setError('Check the business phone number, or leave it blank.');
    onSave({ verification: { ...draft, website: draft.presence === 'no-website' ? '' : website, sourceUrl, checkedAt: new Date().toISOString() } }); setError('');
  }
  return <form className="prospect-form" onSubmit={submit}>
    <a className="text-button" href={researchHref} target="_blank" rel="noopener noreferrer"><Search size={14} />Search business & website<ExternalLink size={12} /></a>
    <label>Online presence<select value={draft.presence} onChange={e => field('presence', e.target.value)}><option value="unresolved">Not established yet</option><option value="website">Official website found</option><option value="social">Social profile only</option><option value="no-website">I checked: no dedicated website</option></select></label>
    {draft.presence !== 'no-website' && <label>Official website or social URL<input value={draft.website} onChange={e => field('website', e.target.value)} placeholder="https://business.de" /></label>}
    <div className="prospect-field-pair"><label>Business phone<input type="tel" value={draft.phone} onChange={e => field('phone', e.target.value)} /></label><label>Business email<input type="email" value={draft.email} onChange={e => field('email', e.target.value)} /></label></div>
    <label>Source you checked<input value={draft.sourceUrl} onChange={e => field('sourceUrl', e.target.value)} placeholder="Public page confirming these details" required /></label>
    <label className="prospect-check"><input type="checkbox" checked={draft.active} onChange={e => field('active', e.target.checked)} />I checked this is the right business and it is active.</label>
    <label className="prospect-check"><input type="checkbox" checked={draft.contactChecked} onChange={e => field('contactChecked', e.target.checked)} />I checked the business contact details.</label>
    {error && <p className="prospect-error" role="alert">{error}</p>}
    <button className="secondary" type="submit"><ShieldCheck size={15} />Confirm details</button>
  </form>;
}
export function ProspectDetails({ business: b, savedLead, settings, onSave, onResearch, researching, researchError, researchHref, section = 'all' }) {
  const p = b.prospect, price = p.price;
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  async function copy() { try { await navigator.clipboard.writeText(outreachDraft(b)); setCopied(true); setCopyError(''); } catch { setCopyError('Select the draft below and copy it manually.'); } }
  return <>
    {section !== 'evidence' && <section className="prospect-proposal" aria-label="Suggested website project">
      <div className="prospect-price-line"><div><h3>Suggested website quote</h3><p>{price.custom ? 'Your quote' : `${settings.market} · ${price.scope} scope`} · excl. VAT</p></div><strong>{money(price.suggested, price.currency)}</strong></div>
      <p className="prospect-price-range">Planning range {priceRange(price)}</p>
      <p className="prospect-reason">{p.reason}</p>
      <p className="prospect-offer">{p.offer}</p>
      <details className="detail-disclosure"><summary><span>Scope & pricing assumptions</span></summary><div className="prospect-form">
        <p>{price.scopeText}.</p><p className="detail-caption">{price.rationale}</p>
        <label>Project scope<select value={savedLead?.scope || 'standard'} onChange={e => onSave({ scope: e.target.value })}><option value="compact">Compact · 1–3 pages</option><option value="standard">Standard niche package</option><option value="extended">Extended content & revisions</option></select></label>
        <label>Your quote ({price.currency}, excl. VAT)<input type="number" min="0" max="1000000" step="50" value={savedLead?.quote ?? ''} placeholder={String(price.suggested)} onChange={e => onSave({ quote: e.target.value })} /></label>
        <p className="detail-caption">Estimate: {price.hours[0]}–{price.hours[1]} hours at {money(settings.rate, price.currency)}/hour, with your minimum project fee. Includes design, build, basic on-page SEO, QA and revisions. Assumes supplied text/photos and one language. Hosting, custom apps, ecommerce, copywriting and legal review are separate.</p>
        <p className="detail-caption">A scope estimate, not this owner’s budget or a promise of a sale. Niche alone does not establish willingness to pay. {settings.market !== 'Germany' || price.currency !== 'EUR' ? 'Your rate sets this local estimate; the references below are German EUR examples, not currency conversions.' : 'Published packages are reference points, not market averages.'}</p>
        <details className="price-references"><summary>Pricing references · checked 9 Oct 2026</summary><ul>{PRICE_SOURCES.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}<ExternalLink size={11} /></a></li>)}</ul></details>
      </div></details>
    </section>}
    {section !== 'proposal' && <details className="detail-disclosure prospect-verification">
      <summary><ShieldCheck size={16} /><span>{p.contactLabel}</span>{p.verified && <Check size={14} />}</summary>
      {p.verifiedAt && <p className="detail-caption">Checked {new Date(p.verifiedAt).toLocaleDateString()}. Recheck after 90 days or if details change.</p>}
      {p.research && <div className="research-evidence"><p>{p.research.matchEvidence}</p><p className="detail-caption">{p.research.summary}</p>{p.research.sources?.map((s, i) => <a key={i} href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer">{s.note || 'Research source'}<ExternalLink size={12} /></a>)}{p.research.auditError && <p className="prospect-error">Website review: {p.research.auditError}</p>}</div>}
      <button className="secondary" type="button" disabled={researching} onClick={onResearch}><Search size={14} />{researching ? 'Research in progress…' : 'Research with AI'}</button>
      {researchError && <p className="prospect-error" role="alert">{researchError}</p>}
      <p className="detail-caption">Searches public sources and reviews a matched website using your selected subscription. An online identity match does not confirm buying interest.</p>
      <VerificationForm key={[p.verifiedAt, p.research?.checkedAt, savedLead?.verification?.email, savedLead?.verification?.phone, savedLead?.verification?.website].join('|')} business={b} lead={savedLead} onSave={onSave} researchHref={researchHref} />
    </details>}
    {section !== 'evidence' && <details className="detail-disclosure prospect-brief"><summary><span>Offer & contact draft</span></summary><div className="prospect-form">
      <label>Verified opportunity<textarea rows={3} value={savedLead?.opportunity || ''} placeholder="A specific issue you checked, with a page or example" onChange={e => onSave({ opportunity: e.target.value })} /></label>
      <label>Your offer<textarea rows={2} value={savedLead?.offer || ''} placeholder={p.offer} onChange={e => onSave({ offer: e.target.value })} /></label>
      <label>Draft introduction<textarea rows={7} readOnly value={outreachDraft(b)} /></label>
      <button className="text-button" onClick={copy}><Copy size={14} />{copied ? 'Copied' : 'Copy draft'}</button>
      <p className="detail-caption">Review the evidence and personalize the wording before contacting. Nothing is sent automatically.</p>{copyError && <p role="alert">{copyError}</p>}
    </div></details>}
  </>;
}
export function FollowUpFields({ lead, business, onSave, onContacted }) {
  return <div className="prospect-form follow-up-fields">
    <label>Next action<input value={lead?.nextAction || ''} placeholder={business.prospect.nextAction} onChange={e => onSave({ nextAction: e.target.value })} /></label>
    <label>Follow-up date<input type="date" value={lead?.nextDate || ''} onChange={e => onSave({ nextDate: e.target.value, completedDate: '' })} /></label>
    <div className="prospect-inline-actions"><button className="secondary" onClick={onContacted}><Check size={14} />Mark contacted</button><button className="text-button" onClick={() => onSave({ nextDate: addDays(1), completedDate: '', nextAction: lead?.nextAction || business.prospect.nextAction })}>Tomorrow</button></div>
    {lead?.lastContact && <p className="detail-caption">Last contact: {new Date(lead.lastContact).toLocaleDateString()}</p>}
    {!!lead?.history?.length && <details><summary>Activity ({lead.history.length})</summary><ul className="prospect-history">{[...lead.history].reverse().map((h, i) => <li key={i}><time>{new Date(h.at).toLocaleDateString()}</time><span>{h.text}</span></li>)}</ul></details>}
  </div>;
}
