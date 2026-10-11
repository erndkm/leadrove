import { launchIsolatedBrowser } from './isolated-browser.mjs';
import { cleanLead } from '../src/prospect-storage.mjs';
import { cleanProfile, effectiveBusiness, estimatePrice } from '../src/prospect-model.mjs';
import { proposalDocument } from '../src/proposal-document.mjs';
import { loadScreenshots } from './opportunities.mjs';

export async function exportProposal(input, directory) {
  const lead = cleanLead(input.lead), business = effectiveBusiness(lead.business, lead), price = estimatePrice(business, cleanProfile(input.settings), lead);
  const { images } = await loadScreenshots(directory, lead.insight?.website === business.website ? lead.insight.screenshotId : '');
  const html = proposalDocument({ business, proposal: lead.proposal, price, checkedAt: lead.insight?.checkedAt || lead.verification?.checkedAt, images });
  if (input.format === 'html') return { html };
  const browser = await launchIsolatedBrowser();
  const deadline = setTimeout(() => void browser.close().catch(() => {}), 30000);
  try {
    const page = await browser.newPage({ javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false });
    await page.route('**/*', route => route.abort());
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return { pdf: pdf.toString('base64') };
  } finally { clearTimeout(deadline); await browser.close(); }
}
