export function mobileChecks(evidence) {
  const mobile = evidence?.mobile;
  if (!mobile) return { label: 'Not checked', status: 'unknown', checks: [] };
  const check = (label, pass, detail) => ({ label, status: pass === null ? 'unknown' : pass ? 'pass' : 'warn', detail });
  const viewport = mobile.viewport || '';
  const responsive = /width\s*=\s*device-width/i.test(viewport);
  const overflowWidths = [mobile.horizontalOverflow ? mobile.width || 390 : null, mobile.narrow?.horizontalOverflow ? mobile.narrow.width || 320 : null].filter(Boolean);
  const maximumScale = viewport.match(/maximum-scale\s*=\s*([\d.]+)/i);
  const zoomAllowed = !/user-scalable\s*=\s*(no|0)(?:\s|,|;|$)/i.test(viewport) && !(maximumScale && Number(maximumScale[1]) < 2);
  const checks = [
    check('Responsive viewport', responsive, responsive ? 'Viewport adapts to the device width.' : viewport ? 'Viewport does not use the device width.' : 'No viewport setting found.'),
    check('Horizontal layout', typeof mobile.horizontalOverflow === 'boolean' ? overflowWidths.length === 0 : null, overflowWidths.length ? `Sideways scrolling observed at ${overflowWidths.map(width => `${width}px`).join(' and ')}.` : typeof mobile.horizontalOverflow !== 'boolean' ? 'Layout was not measured.' : `No sideways scrolling at ${mobile.narrow ? '390px or 320px' : '390px'}.`),
    check('Readable text size', mobile.textSamples > 0 ? mobile.smallTextSamples === 0 : null, mobile.textSamples > 0 ? `${mobile.smallTextSamples} of ${mobile.textSamples} sampled text elements below 12px.` : 'No text sample recorded.'),
    check('Tap target size', mobile.tapTargets > 0 ? mobile.smallTapTargets === 0 : null, mobile.tapTargets > 0 ? `${mobile.smallTapTargets} of ${mobile.tapTargets} sampled controls below 24px. Inline links excluded; spacing not checked.` : 'No controls measured.'),
    check('Zoom allowed', zoomAllowed, zoomAllowed ? 'No viewport restriction on zoom found.' : 'Viewport settings restrict zoom.'),
  ];
  const status = checks.some(item => item.status === 'warn') ? 'warn' : checks.some(item => item.status === 'unknown') ? 'unknown' : 'pass';
  return { checks, status, label: status === 'warn' ? 'Needs attention' : status === 'pass' ? 'Basic checks passed' : 'Limited checks' };
}
