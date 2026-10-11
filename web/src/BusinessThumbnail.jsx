import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Store } from 'lucide-react';
import { safeUrl } from './model.mjs';
import './business-thumbnail.css';

const Images = createContext(null);
export function BusinessImagesProvider({ request, children }) {
  const loader = useMemo(() => {
    const cache = new Map(), queue = [];
    let active = 0, bytes = 0;
    function pump() {
      while (active < 3 && queue.length) {
        const task = queue.shift(); active++;
        request('/business-image', task.input).then(value => task.finish(value?.image || null), () => task.finish(null)).finally(() => { active--; pump(); });
      }
    }
    return input => {
      const key = JSON.stringify(input), cached = cache.get(key);
      if (cached && cached.until > Date.now()) return cached.promise;
      let finish;
      const promise = new Promise(resolve => { finish = image => {
        const entry = cache.get(key);
        if (entry) { entry.size = image?.dataUrl.length || 0; bytes += entry.size; entry.until = Date.now() + (image ? 3600000 : 60000); }
        while ((cache.size > 150 || bytes > 16000000) && cache.size > 1) { const oldest = cache.keys().next().value; bytes -= cache.get(oldest).size || 0; cache.delete(oldest); }
        resolve(image);
      }; });
      if (cached) bytes -= cached.size || 0;
      cache.set(key, { promise, until: Infinity, size: 0 }); queue.push({ input, finish }); pump(); return promise;
    };
  }, [request]);
  return <Images.Provider value={loader}>{children}</Images.Provider>;
}

export default function BusinessThumbnail({ business }) {
  const load = useContext(Images), host = useRef(null);
  const [visible, setVisible] = useState(false), [resolved, setResolved] = useState(null), [failed, setFailed] = useState([]);
  const imageUrl = safeUrl(business.imageUrl), website = business.websiteStatus === 'website' ? safeUrl(business.website) : '', imageSource = safeUrl(business.imageSource);
  const key = `${imageUrl}|${website}`;
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '100px' });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { setFailed([]); setResolved(null); }, [key]);
  useEffect(() => {
    let current = true;
    if (!visible || !load || (!imageUrl && !website) || failed.length >= 3) return;
    load({ website, imageUrl, imageSource, exclude: failed }).then(image => { if (current) setResolved({ key, image }); });
    return () => { current = false; };
  }, [visible, load, website, imageUrl, imageSource, key, failed]);
  const image = resolved?.key === key ? resolved.image : null;
  const shown = image && /^data:image\/(?:png|jpeg|gif|webp|avif|x-icon|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl || '') && !failed.includes(image.url);
  const sourcePage = safeUrl(image?.sourcePage);
  const label = shown ? `${business.name} · ${image.kind}${sourcePage ? ` from ${new URL(sourcePage).hostname}` : ''}` : `No business image available for ${business.name}`;
  return <span ref={host} className={`business-thumbnail-slot ${shown ? 'has-image' : 'is-placeholder'}`} title={label}>
    {shown ? <img className={`business-thumbnail ${image.kind === 'listing photo' || image.kind === 'website image' ? 'is-photo' : 'is-logo'}`} src={image.dataUrl} alt="" width={44} height={44} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(old => [...old, image.url].slice(0, 3))} /> : <Store size={19} aria-hidden="true" />}
  </span>;
}
