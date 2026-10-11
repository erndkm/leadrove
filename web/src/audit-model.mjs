export const AUDIT_CATEGORIES = { ui: 'UI & usability', seo: 'SEO', safety: 'Safety', accessibility: 'Accessibility', performance: 'Performance' };
export const AUDIT_WEIGHTS = { ui: 0.3, seo: 0.25, safety: 0.2, accessibility: 0.15, performance: 0.1 };
export function auditKey(website) {
  try { const url = new URL(website); url.hash = ''; return url.href; } catch { return ''; }
}
export function auditFor(business, reports) { return reports[auditKey(business.website)] || null; }
export function qualityLabel(score) { return score < 40 ? 'Needs major work' : score < 65 ? 'Needs improvement' : score < 80 ? 'Room to improve' : 'Strong website'; }
export function auditQuality(categories) {
  return Math.round(Object.entries(AUDIT_WEIGHTS).reduce((sum, [key, weight]) => sum + categories[key].score * weight, 0));
}
export function attachAudits(businesses, reports) {
  return businesses.map(business => ({ ...business, audit: auditFor(business, reports) }));
}
export function auditResultLabel(business, job) {
  const item = job?.items.find(item => item.website === auditKey(business.website));
  const previous = business.audit ? `, last website quality ${business.audit.qualityScore} out of 100` : '';
  if (job?.status === 'running' && ['queued', 'capturing', 'reviewing'].includes(item?.status)) return `website review ${item.status}${previous}`;
  if (item?.status === 'failed') return `website review failed${previous}`;
  if (item?.status === 'cancelled') return `website review stopped${previous}`;
  return business.audit ? `website quality ${business.audit.qualityScore} out of 100` : business.websiteStatus === 'website' ? 'website not yet rated' : '';
}
