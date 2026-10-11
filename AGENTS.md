# Agent handoff: Leadrove

This file records the project context and the map work completed through 10 October 2026. Read the relevant app README before changing a feature; `web/README.md` has the detailed service, data, and provider behavior.

## Workspace

- `web/` is the React/Vite website and its local Node service. Run `npm run dev` from `web/` (or `npm run web:dev` from this directory). Vite serves the local app at `http://127.0.0.1:5173`.
- `shared/` contains place ranking and the Overpass query/client used by the website. Keep it beside `web/`; Vite allows imports from it.
- `mobile/` is a separate Expo app. The map fixes below were made for the website.
- `web/` has its own Git repository. At this handoff it contains numerous modified and untracked files from ongoing work. Inspect its status before editing, and preserve unrelated changes. This workspace root is not the Git root.

## Map and area search: completed fixes

The user reported a blank map and these area search errors: “The map service is temporarily unavailable,” “Could not reach the map services,” and “The map services are busy. Try again in 6 seconds.” The troublesome search was **Gersthofen, Germany, 3 km**.

- `web/src/BusinessMap.jsx` now uses OpenFreeMap's Liberty vector style through MapLibre and the Leaflet adapter. The previous default OpenStreetMap raster tiles were returning HTTP 403 in the local browser. `VITE_MAP_STYLE_URL` can choose another vector style; `VITE_TILE_URL` plus `VITE_TILE_ATTRIBUTION` switches to raster. `web/server/security.mjs` permits the MapLibre worker under CSP. The basemap, markers, radius, and attribution were visually confirmed in the browser.
- The browser no longer sends business searches directly to Overpass, which caused CORS failures. `web/src/api.mjs` calls `audits.request('/map/search', ...)` via `web/src/App.jsx`. `web/server/http.mjs` implements `POST /api/audits/map/search` with the local service's origin, client-header, and hosted-pairing checks. `web/src/useAudits.mjs` gives this request a 180-second timeout. The service sends Overpass requests with an identifying User-Agent and POST.
- `shared/business-query.mjs` builds a bounded global bounding-box query for ordinary locations; `web/src/model.mjs` filters the returned businesses to the exact selected circle. Near a pole or the international date line, the query falls back to `around`. The former repeated `around` selectors timed out for Gersthofen at 3 km. The bbox form completed in about 3 seconds.
- `shared/overpass.mjs` tries the configured providers sequentially, remembers a working one, applies cooldowns to failing providers, and waits automatically if the next cooldown ends within 10 seconds. The default providers include `overpass-api.de`, `overpass.private.coffee`, and VK Maps. `VITE_OVERPASS_URL` sets a custom provider; `VITE_OVERPASS_FALLBACK_URLS` adds explicit fallbacks. Provider settings are loaded by `web/vite.config.js` for dev and `web/server/start.mjs` for the built service.
- Successful complete searches are cached for 5 minutes in the browser and 15 minutes in the service. The service retains at most six responses of no more than 5,000 elements, and preserves the original `fetchedAt` on a cache hit. Failed or partial searches do not replace previous results.

At the time of the fix, the exact Gersthofen 3 km request returned HTTP 200 with **381 map elements** in about 3 seconds; a repeat served from cache in about 52 ms. `node --test tests/overpass.test.mjs` passed 13/13. These observations confirm that case at that time; public map providers can still be unavailable later. The full test suite and production build were not run as part of that fix.

## Product behavior discussed with the user

- **Sales priority** is a 0–100 research and sales ordering score; higher is a stronger lead to investigate. Map colors use 70–100 high, 45–69 medium, 0–44 low. `web/src/prospect-model.mjs` computes it from recent identity/contact verification, a specific opportunity, fit with the user's offer and niche, contact availability, estimated project-size fit, and local ownership signals. It is not a probability of purchase. The details panel shows each point contribution. **Website quality** is a separate 0–100 score where higher means a better website; do not conflate the two.
- The **Evidence** tab in `web/src/LeadDetails.jsx` is always clickable. It holds website checks, customer-action links, contacts, performance and reputation checks, business verification, and optional AI website review. Within it, **Check website** is disabled when the business has no recorded website URL (`web/src/LeadWorkspace.jsx`). Many OpenStreetMap listings omit that URL. The user can find and confirm an official site in **Business verification** (`web/src/ProspectDetails.jsx`); absence from the listing alone does not prove the business has no website. If the Evidence tab itself cannot be clicked, investigate it as a separate UI defect.

## Useful entry points

- Search flow: `web/src/App.jsx` → `web/src/api.mjs` → `web/server/http.mjs` → `shared/business-query.mjs` and `shared/overpass.mjs` → `web/src/model.mjs`.
- Map rendering: `web/src/BusinessMap.jsx`.
- Lead scoring: `web/src/prospect-model.mjs`; details and evidence: `web/src/LeadDetails.jsx`, `web/src/LeadWorkspace.jsx`, `web/src/ProspectDetails.jsx`.
- Configuration and operations: `web/.env.example`, `web/README.md`, `web/SECURITY.md`.

When investigating another map failure, record the selected place, coordinates, radius, service response, and whether the response contains an Overpass `remark`. An HTTP 200 can still contain a timeout remark rather than a usable search result.
