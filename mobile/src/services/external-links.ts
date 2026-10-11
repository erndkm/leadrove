// Map listings are public, editable data. Only pass the intended action to the OS.
export function phoneLink(raw: string): string {
  const number = raw.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d{3,15}$/.test(number))
    throw new Error('This phone number needs verification. Copy it and check it before dialing.');
  return `tel:${number}`;
}

export function externalLink(raw: string, protocols: string[]): string {
  if (/[\u0000-\u001f\u007f]/.test(raw) || raw.length > 3000)
    throw new Error('This link cannot be opened safely.');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('This link needs verification.'); }
  if (!protocols.includes(url.protocol) || url.username || url.password)
    throw new Error('This link cannot be opened safely.');
  if (url.protocol === 'tel:' && raw !== phoneLink(raw.slice(4)))
    throw new Error('This phone number needs verification.');
  return url.toString();
}
