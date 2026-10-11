# Leadrove website reviews

Leadrove (pronounced **LEED-rohv**) combines *lead* and *rove*: explore a neighborhood and find your next potential client. The brand line is **Find your next local client.**

The custom logo is an L/R ligature: the curved L and forward diagonal of the R combine the two parts of Leadrove's name in one compact monogram. Production artwork lives in `public/brand/`: light, dark and single-color SVG logos, a standalone mark and an Apple touch icon. The capitalized wordmark uses outlined Manrope at weight 750 with adjusted spacing and needs no font download; the font's license is included alongside it. The favicon uses the same monogram in white on forest green, with SVG, 32px PNG and 16/32/48px ICO versions. The legacy `public/favicon.svg` remains compatible. See `public/brand/leadrove-preview.png` for the identity at logo and favicon sizes.

**Domain check, 9 October 2026:** `leadrove.com` returned HTTP 404 from [Verisign's .com RDAP registry](https://rdap.verisign.com/com/v1/domain/leadrove.com) and `No match for "LEADROVE.COM"` from `whois.verisign-grs.com`. It appeared unregistered at the time of checking; it has not been purchased or reserved. Registrar availability and price still need to be confirmed at checkout. This domain check is not trademark clearance.

Existing `cf:*` browser storage, `.clientfinder/` reports, `CLIENTFINDER_*` environment variables and the configured hosted origin retain their original names for compatibility. Rebranding this source does not rename or deploy the hosted site.

This React/Vite workspace can review every dedicated website returned by an area search using a locally signed-in **Codex CLI** or **Claude Code** subscription. It does not use API keys or extract account tokens. Provider subscription limits still apply.

## Run

Keep the sibling `../shared/` folder when copying or checking out this app: the website and mobile app import its place-ranking module. It has no dependencies or separate build step.

Requires patched Node.js LTS 22.23.3+ or 24.21.0+ and a current CLI for at least one provider. The launch commands also support a project-local Windows Node 22.23.3 copy in `.runtime/node-v22.23.3-win-x64/`. See [SECURITY.md](SECURITY.md) for the security review, runtime maintenance, and trust boundaries.

Area searches go through the local service, which avoids browser CORS restrictions and identifies the app to providers. The service asks Overpass for a bounding box, then the app filters results to the selected radius. It uses `overpass-api.de`, `overpass.private.coffee` and the VK Maps Overpass service as sequential providers. Temporary failures try the next provider, and subsequent searches prefer the last working provider. Failing providers receive a cooldown of at least 30 seconds, respecting `Retry-After` when available. Searches arriving within 10 seconds of a cooldown ending wait and retry automatically. Complete searches are cached for five minutes in the current tab and for 15 minutes in the local service; failed or partial responses never replace the last successful results. Small searches reserve 64 MiB and searches over 3 km reserve 128 MiB, instead of Overpass's implicit 512 MiB reservation.

The map uses OpenFreeMap's Liberty vector style by default, with OpenFreeMap, OpenMapTiles and OpenStreetMap attribution. Set `VITE_MAP_STYLE_URL` to choose another MapLibre style. To keep a raster tile source, set `VITE_TILE_URL` and its required `VITE_TILE_ATTRIBUTION`; a raster override takes precedence. Restart Vite after changing these settings.

To use your own service, set `VITE_OVERPASS_URL` in `.env`. That override uses no public fallbacks unless you explicitly set `VITE_OVERPASS_FALLBACK_URLS` to a comma-separated list. Restart Vite or rebuild after changing these settings. See `.env.example`.

1. Install [Codex CLI](https://developers.openai.com/codex/cli) or [Claude Code](https://code.claude.com/docs/en/setup).
2. Sign in with your subscription: `codex login` or `claude auth login`. For Codex, `codex login status` must say it is using ChatGPT. For Claude, use the claude.ai subscription login, not Console API billing.
3. In this directory, run:

   ```sh
   npm install
   npm run audit:setup
   npm run dev
   ```

4. Open **http://127.0.0.1:5173**, open **Discover**, search an area, expand **Website scan**, select a provider and click **Scan all websites**. A single business can also be rated under **Evidence** in its detail panel. Provider setup is also available in **Settings → AI website reviews**.

The audit service starts with Vite, including `npm run preview`. For a built workspace, run `npm run build` followed by `npm start`, then open **http://127.0.0.1:4318**. Keep the process running while scanning; closing the browser does not stop the queue, but shutting down the local service does.

Codex must support `exec --ignore-user-config`, `--ephemeral`, images and structured output. Update the CLI if it rejects these flags. Claude uses `-p` with streamed image input, structured JSON output and no tools. On Windows, native executables and standard npm JS entry points are supported without invoking a shell. For custom installs, set `CLIENTFINDER_CODEX_PATH` or `CLIENTFINDER_CLAUDE_PATH` to the executable or JS entry point before starting the server.

## Place suggestions

Discover suggests up to six places as you type. Exact names and an explicitly typed region or country take priority; browser language, time zone, an area you selected and recent selections help resolve ambiguous names. Suggestions show the region and country before you choose. Selecting a place previews it; **Search area** starts the business search.

Place search uses Photon with a short debounce, request spacing and a temporary cache. The provider receives the typed query, a supported display language and coordinates when an area is already known. Typing never requests GPS permission. The last eight selected places and the selected area stay in this browser (`cf:recent-places` and `cf:place-context`); clearing this site's data removes them. Ranking uses no AI tokens.

## How reviews work

- The area button snapshots **all businesses from the last completed search**, including those hidden by category, chain, or website filters. Changing the draft radius does not change that snapshot. Search the new area first.
- Each unique URL is captured and reviewed once per batch. Businesses sharing that URL share the report. Missing websites and social-only listings are excluded; neither gets an invented website rating.
- Playwright captures the homepage at desktop and mobile viewport sizes. It collects visible text, headings, metadata, labels, image attributes, load observations, HTTPS and selected response headers.
- Mobile checks measure overflow at 390px and 320px, viewport configuration, text below 12px, controls below 24px and zoom restrictions. These are screening observations, not real-device testing or an accessibility certification. Re-scan older reports to collect these measurements.
- Before scanning, a token range covers all unique websites in the search. Without history, it uses an uncalibrated 8,000–30,000 tokens per website planning range. With history, it uses 70–150% of the median of up to 20 saved reviews from the selected provider. Actual usage can fall outside the range. Successful reviews record provider-reported input and output tokens; cancelled or failed attempts may consume additional unrecorded usage.
- Codex account limits are read through the CLI's read-only `account/rateLimits/read` method. The panel shows remaining percentages and reset times when available; Claude's remaining allowance is unavailable here. Subscription quota is not a token balance, so the percentage a proposed scan would consume cannot be reliably calculated. Refresh usage to update the snapshot.
- The selected CLI reviews these observations and two screenshots. Its response is validated before any score is shown. The app never substitutes heuristic scores for an AI failure.
- Website quality is 0–100, with **higher scores meaning better quality**. The weighted score is UI 30%, SEO 25%, safety 20%, accessibility 15%, performance 10%. **Weakest website** sorts the lowest quality scores first; unrated sites follow. The original business research-priority score is separate.
- Each finding includes the evidence, severity and suggested improvement. Expand category scores to read their rationale. CSV exports include scores, findings, provider and review time.
- Reviews run sequentially, often taking a few minutes each. Stop cancels the current review and remaining queue. Unreachable sites fail individually; provider authentication/usage failures stop the batch. Retry unsuccessful websites without repeating completed ones. Rating an already-reviewed website explicitly replaces its report only after success.
- Reports persist in `.clientfinder/reports.json` and are cached in this browser. Active queue state survives a page reload while the server runs, but is not resumed after a server restart. Completed reports remain. The last area search is browser-local; saved leads and watchlists also sync to the connected local service.

## Connect a hosted frontend

A static hosted page cannot run a CLI on your computer. After the updated frontend is deployed, it can connect to the local service:

1. Set `CLIENTFINDER_ALLOWED_ORIGIN` in the server environment to your exact HTTPS frontend origin (no trailing slash), then run `npm run build` and `npm start` locally. In PowerShell, for example: `$env:CLIENTFINDER_ALLOWED_ORIGIN = 'https://clientfinder.layer8problem.chatgpt.site'`.
2. On the hosted page, open **Settings → AI website reviews → Set up website reviews → Connect this hosted page to your computer**.
3. Copy the token from `.clientfinder/connection-token` into the connection field. This is a random local pairing token, **not** your Codex/Claude account token. It stays in that browser tab's session storage.
4. Allow the browser's local-network permission if prompted. Browser support and organizational policies vary; use the local workspace if the connection is blocked.

The service binds to `127.0.0.1:4318`. Hosted access is disabled unless `CLIENTFINDER_ALLOWED_ORIGIN` is explicitly configured; only that exact origin can pair, and it must supply the token. The current frontend sends the required `X-Leadrove-Client` request header; older deployments must be updated before pairing. Do not put the token in source code, a public Vite variable, a URL or a hosted bundle. Requests must arrive from a loopback socket with a matching local Host header. These source changes do not deploy the hosted site automatically.

## Scope and data handling

This is a passive, AI-assisted **homepage** review. Security scores describe HTTPS, mixed-content and header observations; they do not certify security or test vulnerabilities. Performance observations come from a single local load through an inspection proxy, not Lighthouse or field Core Web Vitals. No search rankings, conversion rates or legal compliance are inferred as facts. AI findings need human verification.

The isolated browser has no personal cookies or logins, does not submit forms or click consent banners, blocks service workers and WebSockets, and fetches only public HTTP(S) addresses on ports 80/443. DNS answers are checked and pinned to each socket, including redirects and subresources. Private, loopback, link-local and reserved addresses are blocked. Resource/time limits and bot protection may affect rendering; reports expose these limitations. JavaScript-driven sites and overlays can reduce what is observable.

Public screenshots and observations go to the selected AI provider through its CLI. The CLI is launched with API/provider credentials removed from the inherited environment. Codex uses its existing login, read-only mode, ignored user configuration and disabled action tools; Claude uses its login with no tools, hooks or MCP servers. Page contents are explicitly treated as untrusted evidence. Captures are temporary and removed after review; structured observations and reports are saved locally. No outreach is sent.

The integrations use [Codex subscription authentication](https://learn.chatgpt.com/docs/auth), [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [Claude Code authentication](https://code.claude.com/docs/en/authentication), and [Claude's programmatic CLI](https://code.claude.com/docs/en/headless). They do not turn subscription credentials into general-purpose API keys.

## Daily prospects and website quotes

Open **Today** after searching an area. **Research up to 10** uses the selected Codex or Claude subscription to look for official websites and public business contacts, then reviews a website when the identity matches. Research is sequential, uses subscription allowance, can be stopped, and records available token usage. One business can also be researched from **Needs verification** in its details. Website scans and prospect research do not run concurrently.

AI search results alone do not verify a lead. The local service fetches the candidate homepage and same-domain contact page through the public-network protections, then checks the name plus the listed phone or address and a contact actually present in the fetched text. JavaScript-only sites, incomplete addresses, blocked pages and ambiguous matches stay in **Needs your review**. Absence from search never establishes that there is no website. You can correct the URL/contact and confirm the business manually with a source. Online matching does not establish buying intent or current trading status.

The contact shortlist contains at most 10 businesses with recent verification (90 days), a contact channel, a specific opportunity, a matching offer/niche, and a due next action. It prioritizes scheduled follow-ups, deduplicates shared website domains, excludes closed/not-a-fit/do-not-contact stages, and does not pad an empty list with unverified prospects. **Mark contacted** records activity and schedules a follow-up in three days; dates, actions, stages, offers, opportunities and quotes are editable. Previously researched businesses without enough evidence remain available for manual review. No messages are sent.

Every business shows a suggested one-time website quote and a range in its details. Initial assumptions: **Germany, EUR excluding VAT, solo freelancer at €65/hour, €1,200 minimum project fee, €2,500 target project size**. Change these under **Settings → Your offer, pricing & backups**. Prices use niche-specific delivery hours, scope and your rate, not inferred client wealth or willingness to pay. Compact, standard and extended scope and a manual quote are available per lead. Another currency changes the rate's unit; it does not apply an exchange conversion. German reference packages are linked in the UI, checked 9 October 2026. They are examples, not market averages or proof that a niche has a particular budget.

Leads migrate from the earlier browser saved-lead store. The local service saves `prospects.json` atomically with `prospects.json.bak` as the previous version in `.clientfinder/`. Completed research survives restarts; an interrupted queue is shown for explicit retry. Browser copies allow editing while disconnected and merge with the service on reconnection. **Download backup / Restore backup** exports and merges saved leads, manual verification, pricing preferences, notes and follow-up data without replacing newer edits. Automatic research/audit evidence is also stored in the local service directory; back up that directory for a complete evidence archive. CSV exports include quote, currency, price assumptions, opportunity, offer and follow-up fields. `CLIENTFINDER_DATA_DIR` optionally changes the local data directory for development or the built server.

Research enables only web search (and Claude WebFetch), with shell/file/action tools, hooks and external integrations disabled. Public webpage and listing content is treated as untrusted evidence. This web-enabled discovery step is separate from the tool-free screenshot review described above.

## Find features by task

The main navigation is **Today**, **Discover**, **Pipeline**, **Proposals**, and **Settings**. A business opens an inspector with **Overview**, **Evidence**, **Proposal**, and **Activity**. Summaries stay visible; detailed checks and editing fields expand when needed.

- **Discover → Watchlists:** save the last completed area search and its category, independence, website and technology filters. Choose a daily, weekly or monthly reminder. **Check for changes** compares new, changed and not-returned listings with the previous successful snapshot. Failures retain that snapshot. Reminders appear in the app; no background schedule runs while it is closed. Optional website rechecks inspect up to ten saved, due websites sequentially, reuse recent evidence, and compare presence, technologies, contacts and customer-action links. They do not trigger AI reviews automatically.
- **Evidence:** check the public homepage, same-origin contact page and category-specific customer links, such as booking, menus or quote enquiries. HTTP 404/410 destinations are reported as broken; absent links and blocked checks remain uncertain. The panel separates live, unreachable, blocked, possible parked/placeholder and social-only presence. It also records detected technologies, certificate expiry and mobile overflow. Observed contacts can populate a manual verification draft; identity and contact confirmation are still required. A failed or missing website never establishes that the business needs a new one.
- **Pipeline:** edit stages, follow-ups, opportunity type and actual project value. **Results** groups recorded outcomes by industry and opportunity type. Funnel counts include stages reached or superseded in recorded history. Won revenue uses entered actual values, keeps currencies separate, and excludes scope estimates. Export a CRM-ready CSV or an `.ics` follow-up calendar for import into another app; these exports are not a two-way integration.
- **Proposals:** prepare an editable report with up to three findings, scope, price, next step and sender details. Add numbered callouts to the retained mobile screenshot. Download a PDF or a self-contained HTML file that can be shared without this app; Leadrove does not host a public report link. English/German controls translate report labels and boilerplate. Evidence and custom wording keep their source language until edited. The **Design brief** tab produces an editable, downloadable website brief from the business, scope and findings; it does not generate or host the website itself.

Website evidence captures used in proposals are stored privately under `.clientfinder/evidence/`. Unlike temporary AI-review captures, these PNG files remain available for later exports. Workspace JSON backups include evidence references, proposals, measurements, watchlists and pipeline data, but not the image bytes. Back up the local data directory to preserve the complete archive. Exports include only the report content selected for that business, never provider keys.

## Optional data connections

Core discovery, manual verification, pipeline tracking and proposals work without these API connections. **Settings → Optional data connections** shows their configuration status and setup guides. Keys belong in the server process environment, never in a `VITE_*` variable or frontend bundle. Set them in the same terminal before starting `npm run dev` or `npm start`, then restart the service after changes:

```powershell
$env:LEADROVE_PAGESPEED_KEY = 'your-google-pagespeed-key'
$env:LEADROVE_OUTSCRAPER_KEY = 'your-outscraper-key'
$env:LEADROVE_GOOGLE_PLACES_KEY = 'your-google-places-key'
npm run dev
```

Configure only the services you want to use. These are independent provider accounts, with their own quotas and possible billing:

- **PageSpeed Insights:** a separate measured mobile Lighthouse test, plus page-level or origin-level real-user metrics when Google has enough data. A key is optional for attempts using the public allowance. Missing data is shown as unavailable, never as a zero. These measurements remain separate from the AI review's local-load observations.
- **Outscraper email validation:** checks the selected email address without sending outreach. Results distinguish valid, invalid, risky and unknown. A delivery result does not confirm ownership, business identity or buying intent.
- **Google Places:** returns possible business matches with rating, review count, business status and a Maps link. You explicitly select the matching business. The latest date among returned reviews is labelled as a sample, not a complete review history.

No messages, invitations or outreach are sent by these features. Optional service responses are covered with fixtures in automated tests; using a real provider requires your configuration and an explicit action in the interface.

## Business images

Business rows reserve a thumbnail before the name. All photos, including tagged OpenStreetMap / Wikimedia photos, go through the connected local service's protected image fetcher. If absent or broken, it tries images, logos and icons from the listed business website. The browser receives image bytes and never follows a listing's photo URL directly. Only visible rows request images, with three concurrent requests and bounded temporary caches. Image lookup uses public HTTP requests, not an AI subscription or a paid image API. The tooltip identifies a listing photo, website image, logo or icon. A neutral store symbol appears when no usable source exists or the local service is disconnected. Missing-website businesses need a tagged photo or an established website before a real image can be shown; prospect research or a manual URL correction supplies the latter.

Website images are fetched with the same public-network/DNS protections as audits, bounded redirects/time/bytes and image signature checks. Returned image bytes are displayed only in an image element. No personal browser login or cookies are forwarded. Refreshing the page retries unavailable sources after the short cache expires. Sources may block images or provide no suitable asset.

## Validation

`npm test` covers ranking/export, validated AI output, queue cancellation and recovery, subscription credential isolation, public-network restrictions, local API access controls, watchlist changes and persistence, evidence classification, optional-service normalization, pipeline accounting and safe document/calendar exports. `npm run build` builds the frontend. Unit tests use injected provider fixtures and never spend subscription usage; live reviews only run when explicitly started.
