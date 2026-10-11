export function estimateScanTokens(websiteCount, reports, provider) {
  const samples = Object.values(reports).filter(report => report.provider === provider && Number.isSafeInteger(report.usage?.totalTokens) && report.usage.totalTokens > 0)
    .sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt)).slice(0, 20).map(report => report.usage.totalTokens).sort((a, b) => a - b);
  const median = samples.length ? (samples[Math.floor((samples.length - 1) / 2)] + samples[Math.floor(samples.length / 2)]) / 2 : null;
  // A planning heuristic until local usage is available, not a provider quote.
  return { low: Math.round(websiteCount * (median ? median * .7 : 8000)), high: Math.round(websiteCount * (median ? median * 1.5 : 30000)), samples: samples.length };
}

export function recordedUsage(items) {
  const measured = items.filter(item => Number.isSafeInteger(item.usage?.totalTokens) && item.usage.totalTokens >= 0);
  return measured.length ? { total: measured.reduce((sum, item) => sum + item.usage.totalTokens, 0), count: measured.length } : null;
}

export function formatTokens(value) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function quotaWindowLabel(minutes, key) {
  if (!minutes) return key === 'primary' ? 'Current window' : 'Longer window';
  if (minutes === 10080) return 'Weekly';
  if (minutes % 1440 === 0) return `${minutes / 1440} days`;
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} minutes`;
}
