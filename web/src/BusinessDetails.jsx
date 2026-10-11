import { safeUrl } from './model.mjs';
import { Bookmark, Check, ChevronDown, Clock3, ExternalLink, Globe2, Link2, Mail, MapPin, Phone, Search, Target, X } from 'lucide-react';
import { AuditDetails } from './WebsiteAudits.jsx';
import './business-details.css';
import BusinessTypeLabel from './BusinessTypeLabel.jsx';
import { ProspectDetails, FollowUpFields } from './ProspectDetails.jsx';

const distanceLabel = value => value < 1 ? `${Math.round(value * 1000)} m away` : `${value.toFixed(1)} km away`;
const dateLabel = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function BusinessDetails({ business, savedLead, audits, statuses, panelRef, researchLocation, prospects, onSave, onToggleSave, onReviewSetup, onClose }) {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.email || '') ? business.email : '';
  const phoneHref = business.phone ? `tel:${business.phone.replace(/[^+\d]/g, '')}` : '';
  const emailHref = email ? `mailto:${encodeURIComponent(email)}` : '';
  const researchHref = `https://www.google.com/search?q=${encodeURIComponent(`${business.name} ${business.address || business.searchLocation || researchLocation} website`)}`;
  const hasWebsite = business.websiteStatus === 'website' && business.website;
  const hasContacts = phoneHref || emailHref || business.website;
  const PresenceIcon = business.websiteStatus === 'social' ? Link2 : Globe2;

  return <aside className="inspector" ref={panelRef} tabIndex={-1} aria-label={`Details for ${business.name}`}>
    <header className="detail-header">
      <div className="detail-name-row">
        <h2>{business.name}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close business details"><X size={19} /></button>
      </div>
      <p className="detail-meta"><BusinessTypeLabel business={business} />{Number.isFinite(business.distance) && <span>{distanceLabel(business.distance)}</span>}</p>
      <p className="detail-location"><MapPin size={14} aria-hidden="true" /><span>{business.address || 'Address not listed'}</span></p>
      {hasContacts && <div className="detail-quick-actions" aria-label="Contact business">
        {phoneHref && <a href={phoneHref} title={business.phone} aria-label={`Call ${business.phone}`}><Phone size={16} /><span>Call</span></a>}
        {emailHref && <a href={emailHref} title={email} aria-label={`Email ${email}`}><Mail size={16} /><span>Email</span></a>}
        {business.website && <a href={safeUrl(business.website)} target="_blank" rel="noopener noreferrer"><Globe2 size={16} /><span>{hasWebsite ? 'Website' : 'Social profile'}</span><ExternalLink size={12} /></a>}
      </div>}
    </header>

    <div className="inspector-scroll">
      <ProspectDetails business={business} savedLead={savedLead} settings={prospects.settings} onSave={onSave} onResearch={() => prospects.start([business], audits.provider)} researching={prospects.running || prospects.submitting || audits.running} researchError={prospects.error} researchHref={researchHref} />
      {hasWebsite ? <AuditDetails business={business} audits={audits} onSetup={onReviewSetup} /> : <section className="detail-presence" aria-label="Online presence">
        <div className="detail-presence-heading"><PresenceIcon size={22} aria-hidden="true" /><div><h3>{business.websiteStatus === 'social' ? 'Social profile only' : business.prospect.verified ? 'No dedicated website · checked' : 'No website listed'}</h3><p>{business.prospect.verified ? 'Your confirmed online presence assessment.' : 'The listing may be incomplete.'}</p></div></div>
        <a href={researchHref} target="_blank" rel="noopener noreferrer"><Search size={15} />Check online<ExternalLink size={13} /></a>
      </section>}

      <details className="detail-disclosure priority-details">
        <summary><Target size={17} aria-hidden="true" /><span>Sales priority</span><strong>{business.score}<small>/100</small></strong><ChevronDown size={15} className="detail-chevron" /></summary>
        <ul className="detail-signals">{business.signals.map((signal, i) => <li key={i}>
          <details><summary><span>{signal.label}</span><strong>{signal.points > 0 ? '+' : ''}{signal.points}</strong><ChevronDown size={13} className="detail-chevron" /></summary><p>{signal.detail}</p></details>
        </li>)}</ul>
        <p className="detail-caption">A research signal, not a purchase prediction.</p>
      </details>

      <section className="detail-tracking" aria-labelledby="tracking-title">
        <h3 id="tracking-title">Your follow-up</h3>
        <div className="detail-status"><label htmlFor="lead-status">Status</label><select id="lead-status" value={savedLead?.status || 'To review'} onChange={e => onSave({ status: e.target.value })}>{statuses.map(status => <option key={status}>{status}</option>)}</select></div>
        <FollowUpFields lead={savedLead} business={business} onSave={onSave} onContacted={() => prospects.contacted(business)} />
        <details className="detail-disclosure detail-notes">
          <summary><span>Notes</span><span className="detail-caption">{savedLead?.notes ? 'Saved' : 'Add a note'}</span><ChevronDown size={15} className="detail-chevron" /></summary>
          <label htmlFor="lead-notes" className="sr-only">Notes</label>
          <textarea id="lead-notes" placeholder="What would you offer?" rows={3} value={savedLead?.notes || ''} onChange={e => onSave({ notes: e.target.value })} />
          <p className="detail-caption">Saved as you type.</p>
        </details>
      </section>

      <details className="detail-disclosure detail-listing">
        <summary><span>Listing details</span><ChevronDown size={15} className="detail-chevron" /></summary>
        <dl>
          {business.phone && <div><dt><Phone size={14} />Phone</dt><dd><a href={phoneHref}>{business.phone}</a></dd></div>}
          {email && <div><dt><Mail size={14} />Email</dt><dd><a href={emailHref}>{email}</a></dd></div>}
          {business.hours && <div><dt><Clock3 size={14} />Hours</dt><dd>{business.hours}</dd></div>}
          <div><dt>Source</dt><dd><a href={safeUrl(business.source)} target="_blank" rel="noopener noreferrer">OpenStreetMap<ExternalLink size={12} /></a></dd></div>
          {business.imageSource && <div><dt>Photo</dt><dd><a href={business.imageSource} target="_blank" rel="noopener noreferrer">Image source<ExternalLink size={12} /></a></dd></div>}
          {business.fetchedAt && <div><dt>Retrieved</dt><dd>{dateLabel(business.fetchedAt)}</dd></div>}
        </dl>
      </details>
    </div>

    <footer className="inspector-action">
      {hasWebsite && <a className="secondary detail-research" href={researchHref} target="_blank" rel="noopener noreferrer"><Search size={16} />Research</a>}
      <button className={savedLead ? 'secondary' : 'primary'} onClick={onToggleSave} aria-pressed={!!savedLead} title={savedLead ? 'Remove from saved leads' : 'Save this business'}>{savedLead ? <Check size={17} /> : <Bookmark size={17} />}{savedLead ? 'Saved lead' : 'Save lead'}</button>
    </footer>
  </aside>;
}
