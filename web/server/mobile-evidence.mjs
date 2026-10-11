// Self-contained so Playwright can evaluate it in the isolated page.
export function inspectMobile() {
  const visible = node => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const text = [...document.querySelectorAll('p, a, button, label, h1, h2, h3')].filter(node => visible(node) && node.textContent.trim()).slice(0, 200);
  const controls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')]
    .filter(node => visible(node) && !node.disabled && !(node.tagName === 'A' && getComputedStyle(node).display === 'inline')).slice(0, 200);
  return {
    width: innerWidth,
    viewport: document.querySelector('meta[name="viewport" i]')?.content || '',
    horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) > innerWidth + 4,
    textSamples: text.length,
    smallTextSamples: text.filter(node => parseFloat(getComputedStyle(node).fontSize) < 12).length,
    tapTargets: controls.length,
    smallTapTargets: controls.filter(node => { const rect = node.getBoundingClientRect(); return rect.width < 24 || rect.height < 24; }).length,
  };
}
