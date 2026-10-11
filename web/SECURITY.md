# Security review — 9 October 2026

Leadrove is a single-user application for a trusted local operating-system account. It is not a public multi-user service. This review hardened the application and exercised its security boundaries; it is not a guarantee against all vulnerabilities or a third-party penetration test.

## Protections implemented

| Boundary | Protection |
| --- | --- |
| Local API | Loopback socket and matching Host checks; exact-origin validation; mandatory non-simple client header; JSON-only mutations; no credential cookies. Hosted access is opt-in and requires a random pairing token. |
| Browser | Production CSP restricts scripts to local assets and allows only same-origin workers for the map renderer. It blocks inline script injection, framing, objects, and base-URL injection. No-referrer, no-sniff, same-origin opener/resource policies and limited device permissions are applied. |
| Private files | Development middleware and Vite deny rules block local data, tokens, environment files, keys, Git internals, runtime files and review artifacts. Production serves only supported assets inside the real build directory and rejects escaping symlinks. |
| Website capture | Fresh Chromium context with its OS sandbox enabled, no saved login, no downloads, no permissions, no service workers or WebSockets. A deny proxy blocks requests that bypass interception. Approved GET requests are fulfilled with bytes fetched by the server. |
| Public fetches | Public HTTP(S), standard ports, no URL credentials, restricted-address and all-DNS-answer checks, pinned socket addresses, bounded redirects, bytes and time, including DNS. Image URLs use the same protections instead of loading directly in the user's browser. |
| AI execution | Existing shell-free CLI launch, restricted credential environment, temporary working directory, validated output, tool restrictions, and untrusted-evidence prompts retained. Repeated status checks share one CLI lookup and have a cooldown. No model-generated command is executed. |
| Resource usage | Global request budget, per-operation concurrency limits, serialized AI-start requests, timed and size-limited JSON bodies, bounded provider responses, browser deadlines and image caches. Limits return 429 with Retry-After. |
| Stored and exported data | Input normalization, reserved-ID rejection, escaped HTML, validated links, formula-safe CSV and escaped calendar fields. Launch commands restrict the data directory to the owner (POSIX) or current user, SYSTEM and administrators (Windows). New files also use private POSIX modes where supported. Existing lead data is preserved. |

Production permits HTTPS connections/images for configured map providers and public assets. Inline styles remain necessary for React/Leaflet, and Google Fonts is allowed. Development additionally allows Vite's inline development scripts and local HMR WebSockets. Use `npm run build` then `npm start` for the stricter production policy. Headers for a separately hosted deployment must be configured by that host; local middleware cannot set a third party's headers.

## Runtime and maintenance

The installed system Node was 22.14.0. A project-local Node 22.23.3 Windows x64 distribution was downloaded from nodejs.org and verified against its published SHA-256 checksum. It lives in ignored `.runtime/`; it is not included in source control or the web build. `npm run dev`, `npm start`, and `npm run preview` use it when the system runtime is older than the supported patch baseline. Fresh checkouts should install Node LTS 22.23.3+ or 24.21.0+; `.node-version` pins the tested Node 22 release. These version floors reflect this review date, not a promise that future advisories need no updates.

Use a supported OS/browser, keep Node, Playwright's browser (`npm run audit:setup` after updating Playwright), dependencies and the chosen AI CLI patched. Run `npm audit`, build, and the tests after updates. npm's advisory scan does not cover Node itself, browser binaries, CLI installations, or every unknown vulnerability. Never disable the scan browser's sandbox to work around a launch failure; repair the host environment instead.

## Pairing and data

For local use, open `http://127.0.0.1:5173` (development) or `http://127.0.0.1:4318` (production). Cross-origin hosted access is off by default. To enable it, set `CLIENTFINDER_ALLOWED_ORIGIN` to the exact HTTPS frontend origin before launching, then pair using `.clientfinder/connection-token`. The updated client header is also required. Keep the data directory outside `public/` and `dist/`.

The pairing token grants access to your local leads and configured subscription/data-provider features. Keep it out of URLs, public environment variables, logs and exports. If it is disclosed, stop the service, remove only the `connection-token` file, and restart to generate a new token; reconnect the hosted tab with the replacement. Remove the allowed-origin setting to disable hosted access.

Local JSON, screenshots, downloaded backups and browser storage are not encrypted by this app. Startup restricts the private data folder's access rules, and this machine's existing data and token permissions were corrected. Protect the OS account, disk encryption and exported backup locations too. A process or browser extension with access to the same OS/browser account is outside this application's authentication boundary. Administrators retain administrative access. Launch through the documented npm commands so the runtime and filesystem checks run. Do not port-forward or reverse-proxy this personal service onto the internet.

Public website evidence goes to the selected AI provider when you request a review. Optional data integrations send their documented query data to their providers only when used. Search-enabled research can still be influenced by malicious page content; its results are verified against retrieved evidence and require human review. Prompt instructions alone are not a complete prompt-injection defense.

## Verification

The regression suite covers origin/token/Host enforcement, default-denied hosted access, preflights, body limits and UTF-8 handling, slow input and DNS, rate limits, file traversal and symlinks, export injection, CLI lookup coalescing, and browser network containment. Real Chromium fixtures exercise hostile scanned pages, safe PDF generation, the running Vite app and built app, photo proxying, and production CSP script blocking. No paid integrations or AI reviews are invoked by these tests.

Run `npm test` and `npm run build`. The browser security check creates an isolated temporary build so it always tests the current source. The latest npm audit at this review reported no known dependency vulnerabilities.

## References

- [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): address validation and DNS-pinned connections.
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): custom request headers and strict origin checks.
- [OWASP CSP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html): restrictive script policy and framing controls.
- [OWASP prompt-injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html): least privilege and controls outside the model.
- [Playwright browser sandbox option](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-chromium-sandbox) and [Vite file deny rules](https://vite.dev/config/server-options.html#server-fs-deny).
- [Node.js security releases](https://nodejs.org/en/blog/vulnerability) and [verified Node 22.23.3 distribution](https://nodejs.org/dist/v22.23.3/).
