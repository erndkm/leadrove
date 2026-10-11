import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, MapPin, ArrowRight, History } from 'lucide-react';
import { searchLocations } from './api.mjs';
import { browserPlaceContext, readRecentPlaces, rememberPlace } from './location-search.mjs';
import './location-search.css';

export default function LocationSearch({ value, selectedLabel, nearby, disabled, inputRef, actionsRef, onChange, onSelect, onLocate }) {
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState([]);
  const [recent, setRecent] = useState(readRecentPlaces);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const [request, setRequest] = useState(0);
  const [composing, setComposing] = useState(false);
  const pending = useRef(null);
  const listRef = useRef(null);
  const context = useMemo(() => browserPlaceContext({ nearby, recentPlaces: recent }), [nearby, recent]);
  const query = value.trim();
  const editing = query !== selectedLabel?.trim();
  const showRecent = !query || !editing;
  const options = showRecent ? recent.slice(0, 6) : places;
  const expanded = open && !disabled;

  function close() {
    pending.current?.abort();
    setOpen(false);
    setActive(-1);
  }
  function findNow() {
    inputRef.current?.focus();
    setOpen(true);
    setRequest(n => n + 1);
  }
  useEffect(() => {
    actionsRef.current = { search: findNow, dismiss: close };
    return () => { actionsRef.current = null; };
  });

  useEffect(() => {
    pending.current?.abort();
    setPlaces([]); setActive(-1); setError('');
    if (!expanded || !editing || query.length < 2 || composing) { setStatus('idle'); return; }
    const controller = new AbortController();
    pending.current = controller;
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const found = await searchLocations(query, { signal: controller.signal, context });
        if (controller.signal.aborted) return;
        setPlaces(found); setActive(found.length ? 0 : -1); setStatus('ready');
      } catch (cause) {
        if (controller.signal.aborted || cause.name === 'AbortError') return;
        setError(cause.message); setStatus('error');
      }
    }, request ? 150 : 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, editing, expanded, composing, context, request]);

  useEffect(() => {
    if (active >= 0 && expanded) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, expanded]);

  function choose(place) {
    close();
    setRecent(rememberPlace(place));
    onSelect(place);
  }
  function keyDown(event) {
    if (event.nativeEvent.isComposing || composing) return;
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      if (options.length) setActive(index => event.key === 'ArrowDown' ? (index + 1) % options.length : (index <= 0 ? options.length - 1 : index - 1));
    } else if (expanded && options.length && active >= 0 && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault(); setActive(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' && expanded && active >= 0 && options[active]) {
      event.preventDefault(); choose(options[active]);
    } else if (event.key === 'Enter' && editing) {
      event.preventDefault(); findNow();
    }
  }
  const message = showRecent ? (recent.length ? 'Recent locations' : 'Type a town, neighborhood or address.')
    : query.length < 2 ? 'Type at least two characters.'
    : status === 'loading' ? 'Finding locations…'
    : status === 'error' ? error
    : status === 'ready' && !places.length ? 'No matching location. Try a nearby town or add a region.'
    : 'Choose a location to preview';

  return <div className="location-group location-autocomplete" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <label htmlFor="location">Search location</label>
    <div className="input-wrap"><MapPin size={18} aria-hidden="true" />
      <input id="location" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? 'location-results' : undefined} aria-activedescendant={expanded && active >= 0 && options[active] ? `location-option-${active}` : undefined} aria-describedby="location-search-hint" disabled={disabled} ref={inputRef} value={value} onChange={event => { pending.current?.abort(); setPlaces([]); setActive(-1); setRequest(0); setOpen(true); onChange(event.target.value); }} onFocus={() => setOpen(true)} onKeyDown={keyDown} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} placeholder="Town, neighborhood or address" autoComplete="off" spellCheck="false" maxLength={200} />
      <button type="button" className="location-button" onClick={() => { close(); onLocate(); }} disabled={disabled} aria-label="Use my current location" title="Use my current location"><LocateFixed size={18} /></button>
    </div>
    <span id="location-search-hint" className="sr-only">Suggestions appear as you type. Use the arrow keys and Enter to choose a location, then Search area to find businesses.</span>
    <span className="sr-only" role="status" aria-live="polite">{expanded ? (options.length ? `${options.length} ${showRecent ? 'recent locations' : 'location suggestions'} available.` : message) : ''}</span>
    {expanded && <div className="location-results location-suggestions">
      <p className="location-suggestion-status" aria-hidden="true">{message}</p>
      <div id="location-results" role="listbox" aria-label={showRecent ? 'Recent locations' : 'Location suggestions'} aria-busy={status === 'loading'} ref={listRef}>
        {options.map((place, index) => <button key={place.id || `${place.lat},${place.lng}`} id={`location-option-${index}`} type="button" role="option" tabIndex={-1} aria-selected={active === index} onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(place)}>
          {showRecent ? <History size={17} aria-hidden="true" /> : <MapPin size={17} aria-hidden="true" />}
          <span className="location-suggestion-copy"><strong>{place.name || place.label.split(',')[0]}</strong><span>{place.label.startsWith(`${place.name}, `) ? place.label.slice(place.name.length + 2) : place.label === place.name ? '' : place.label}</span></span>
          <ArrowRight size={15} aria-hidden="true" />
        </button>)}
      </div>
      {status === 'error' && <button type="button" className="location-retry" onMouseDown={event => event.preventDefault()} onClick={findNow}>Try location search again</button>}
    </div>}
  </div>;
}
