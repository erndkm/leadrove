# Leadrove mobile

One Expo / React Native application for iOS and Android. It uses the website's Manrope typography, forest green identity and neutral surfaces, with native navigation, device permissions and local storage.

## Start

Use Node 22.23.3+ or 24.21.0+ and install dependencies in this folder:

```sh
npm install
npm start
```

Expo Go and `npm run web` can preview the interface and foreground discovery. Background location requires a **development build**; Expo Go is not a background tracking test environment. Android Expo Go also disables local alerts because SDK 57's notification module cannot initialize there. Installed native builds support alerts.

For Android, install Android Studio's SDK/emulator and a compatible JDK, then run:

```sh
npm run dev:android
```

For iOS, use a Mac with Xcode and run `npm run dev:ios`. A physical iPhone also needs signing. Alternatively, `eas.json` contains development, preview and production profiles for EAS Build; cloud builds require your Expo account and the relevant signing credentials. No build has been submitted to either app store.

Subsequent development sessions can use `npm start`, `npm run android`, or `npm run ios` with the installed development client. The parent directory also has commands for both the website and app.

## Screens

- **Today:** today's nearby leads and a single discovery control.
- **Nearby:** start or pause a daily session, manage alerts, and review daily encounters from today or the last seven days.
- **Discover:** search by city or neighborhood, use your location, or choose an exact point on the map.
- **Saved:** keep businesses and notes for later. Business details show category, contact actions, website evidence and the original map listing.
- **Settings:** radius, minimum priority, business types, chain inclusion, notification limits and local history controls.

## Place suggestions

Discover suggests up to six places while you type and shows recent areas when the field is empty. The website and app use the same ranking rules from `../shared/`, which must remain beside both application folders. Exact names and typed region/country qualifiers take priority; device language, region, time zone and recent choices help with ambiguous names.

An already permitted location fix can provide a nearby hint when it is less than 30 minutes old and accurate within 10 km. Otherwise, the last selected named area can provide that hint. Typing never requests location permission or starts GPS. Photon receives the query, supported display language and coordinates if this optional hint is available. Debouncing, request spacing and caching reduce repeated requests. Ranking uses no AI tokens.

Up to six selected named areas are saved on this device. **Clear history** removes these choices along with discovery history. Selecting an area starts a business search; **Use my location** remains an explicit action. Native language/region access uses `expo-localization`; existing development clients must be rebuilt after installing this dependency.

## Choose a search area on the map

In **Discover → Choose on map**, tap anywhere to place the search pin, or drag the pin to refine it. Pan and pinch to explore. The circle previews the radius from Settings, and **Search this area** searches the selected coordinates with your existing filters. Opening, moving or canceling the picker does not search or consume a business-search request. Cancel, Android Back and Escape discard the draft and preserve the current results. Map selection does not request GPS permission or start daily discovery.

The picker starts at the last selected area, a recent area or an available session location. With no prior location, Berlin is explicitly labelled as the starting view; tap a point before confirming. Selected map coordinates appear in recent areas. The map supports keyboard arrows to pan, plus/minus to zoom and Enter to select the viewport center. Failed tiles show a retry action, while city search stays available after canceling.

The map uses locally bundled Leaflet 1.9.4 and OpenStreetMap tiles in a [React Native WebView](https://docs.expo.dev/versions/latest/sdk/webview/) on iOS/Android, with an iframe adapter for Expo web. No Google Maps key is needed. It includes visible attribution, identifies native tile requests as Leadrove, and does not prefetch or download offline regions. Browsing sends visible tile coordinates to OpenStreetMap; [its tile service policy](https://operations.osmfoundation.org/policies/tiles/) applies.

After pulling this change, run `npm install` and rebuild an existing development client (`npm run dev:android` or `npm run dev:ios`) to include the new native WebView module. Expo Go includes WebView; the existing background-discovery limitations still apply. If updating the pinned Leaflet dependency, run `npm run maps:bundle` to regenerate its local code, styles and license under `src/vendor/`.

## Daily discovery

Discovery is off by default. Start requests foreground location first and explains the optional background permission separately. If background permission is unavailable or declined, a foreground session works while the app is active and pauses when it leaves the foreground. Background sessions use Android's visible foreground service and iOS's location indicator.

The app checks qualifying location updates after at least 200 meters of movement and two minutes since its last scan. Inaccurate, stale and implausible fixes are rejected. Searches are limited to 80 requests per day, with an additional manual cooldown and bounded radius. These limits reduce GPS and network work; they cannot guarantee a particular battery cost or discovery interval.

A session expires at local midnight. Expiry is enforced on the next location callback or app activation as well as the foreground timer. **The operating system controls background delivery. Force-quitting, battery restrictions, revoked permissions or an unavailable map service can interrupt discovery.** Restarting the app does not silently opt you into a new day's session. See [Expo's background location requirements](https://docs.expo.dev/versions/v57.0.0/sdk/location/).

Alerts are optional **local device notifications**, delivered after this phone discovers a qualifying lead. They do not require a push server or transmit a push token. A daily limit and encounter deduplication reduce repeated alerts; tapping an alert opens the business. Remote server-sent push is not configured.

## Data and privacy

- Business data comes from OpenStreetMap through Overpass; place search uses Photon. By default, business searches use overpass-api.de, with maps.mail.ru as a sequential fallback for transient failures. Both receive the search coordinates and radius when used. A custom EXPO_PUBLIC_OVERPASS_URL replaces both defaults and never falls back to public providers. Place queries and optional location hints go to Photon. Permission disclosures appear before enabling tracking.
- Unsaved encounters are retained locally for seven calendar days. Saved businesses and notes remain until removed. The app stores its latest location while a session runs, not a route history; pausing clears that location. Clear history also pauses discovery and keeps saved businesses.
- Native persistence uses unencrypted SQLite in the app sandbox; browser previews use localStorage. Android builds generated with the private-storage plugin exclude app data from cloud backup and device transfer. iOS OS-backup exclusion has not been implemented or verified. There is no account or automatic sync with the website in this version.
- Website status means what the map listing records. A missing URL is not proof that a business has no website. Priority is a research heuristic, not buying intent or a website audit.
- No AI scans, subscription tokens or automated outreach are used by mobile discovery. The website's local CLI review service remains in `../web`.
- Public map services have incomplete coverage and limited capacity. Configure `EXPO_PUBLIC_OVERPASS_URL` for a suitable service before a larger rollout. It is a public bundled value, not a place for an API secret.

Source data is attributed to [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under ODbL. Each business links to its source listing.

## Checks

```sh
npm run typecheck
npm test
npx expo-doctor
npm run export
```

Before distributing a signed build, verify on physical iOS and Android devices: denied/foreground/background location permissions, notification permission denial and recovery, movement with the screen locked, pause during a request, midnight expiry, notification taps from a cold start, offline recovery, large text, and platform battery restrictions. Simulator or browser checks do not establish all-day real-device delivery.

### Verified on 9 October 2026

- TypeScript and all 51 discovery, provider, lifecycle, place-search and notification-boundary tests passed.
- Expo Doctor passed all 21 checks. Production JavaScript exports succeeded for iOS, Android and web.
- The place-suggestion update passed shared ranking tests and desktop/mobile browser checks; fresh iOS, Android and web exports succeeded. Its Android development APK built and installed, but the development client stalled during startup. The new native place-search screen remains unverified: automatic approval review rejected subsequent relaunch commands with "blocked by policy" and no further explanation.
- The Android development APK built and installed successfully in an isolated Android 15 emulator. Native screens, location and notification permission prompts, precise GPS acquisition, the active background location service, persistence through reload, and Pause were exercised. Pausing removed foreground-service status.
- Browser checks covered the main routes, real place search, saved notes through reload, encoded business IDs, dark appearance, 320px layouts and a simulated 200% text stress check. Populated screenshots used browser-only fixtures.
- The public Overpass service returned a busy response during native discovery. Error recovery was visible, but delivery of a notification for a newly discovered real business and notification tap routing were not verified end to end. Automatic approval review rejected the local test-provider override with “blocked by policy”; it was not used.
- iOS native compilation/signing and all-day physical-device behavior remain unverified on this Windows host. No store submission was made.

The dependency audit also reports upstream Expo/React Native dependency advisories, including development tooling. Review `npm audit` and compatible SDK updates before public distribution; a clean audit is not claimed here.

### Map selection checks, 10 October 2026

- All 51 current tests and TypeScript passed; Expo's dependency compatibility check passed.
- Production JavaScript exports passed for iOS, Android and web. The Android development APK rebuilt with WebView and was installed in the emulator without clearing app data.
- Native Android checks exercised real map tiles, tap selection, panning without moving the chosen point, Android Back cancellation, and a confirmed 500 m search that returned real businesses.
- Isolated browser checks covered 390 px, 320 px, dark landscape and desktop: exact search coordinates/radius, pin drag, keyboard selection/cancellation, no GPS or business queries before confirmation, preserved results/history/settings after cancel, tile failure/retry and 200% text. At large text sizes the footer scrolls to keep its controls reachable.
- iOS native compilation and physical-device map gestures remain unverified on this Windows host. No store build or submission was made.


## Security and map reliability review — 9 October 2026

The mobile search previously used one Overpass endpoint and reported every HTTP error as a busy server. Live probes succeeded, so this review does not establish the exact error seen on the user's phone. Provider overload, timeouts and connection failures are now recoverable through the shared, sequential fallback client used by both apps. A live call through the updated mobile service returned 249 businesses in a 500 m Berlin test area.

### Fixed

- **Map availability:** per-provider timeouts and cooldowns, `Retry-After`, fallback on transient failures, explicit HTTP/configuration errors, and five-minute bounded caching of complete results. Cached results are filtered against current settings. Partial/error responses are never cached as empty searches. Queries request 32 MB of provider memory, at most 250 results and a radius of 200?1500 m.
- **Location and transport:** finite coordinate/radius validation before query construction; HTTPS-only provider URLs without embedded credentials; requests omit cookies. A custom endpoint never leaks searches to the default fallback providers. Pausing still aborts active discovery requests.
- **Android backups (privacy):** the installed development build allowed backups despite the intended device-local storage. `app.json` and `plugins/with-private-storage.cjs` now set `allowBackup=false` and generate explicit cloud/device-transfer exclusions, including databases. Unused storage and microphone permissions are blocked; release traffic disables cleartext HTTP. Development builds retain the local Metro exception.
- **Release signing:** generated Gradle release builds no longer fall back to the public debug keystore. EAS or the developer must configure a private production signing key. Debug builds remain usable.
- **Untrusted contact data:** phone actions reject service codes, dial sequences and ambiguous numbers; website/source links reject embedded credentials, control characters and unintended schemes.
- **Incoming links:** malformed percent encodings and oversized links are rejected before native router query parsing. The browser entry applies the same check before initializing the router. This reduces exposure to the decoder advisory; it is not a dependency patch.

### Remaining findings

`npm audit` reports **29 affected mobile packages: 18 high, 11 moderate**, with no critical findings. These are dependency-tree counts, not 29 independent application exploits. The underlying advisories concern `braces`, `node-forge`, `uuid`, and `decode-uri-component`. The first three are reached through build/development tooling; the decoder is also used by Expo Router at runtime. The web dependency audit reports zero known advisories.

The patched decoder 0.5.0 is ESM, while the installed query-string 7 dependency calls the old CommonJS export as a function. A blind override is incompatible. The registry currently has no patched `braces` or `node-forge` release; npm proposes unsupported Expo/React Native downgrades for several inherited advisories. Plan and test a compatible SDK/dependency migration instead of `npm audit fix --force`. See the [decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv), and [uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

Native database contents are not encrypted by the app. Device/OS security remains the storage boundary, and iOS backups need a separate native review. A dedicated provider is still needed before a public rollout: fallback improves availability but public Overpass instances have no reliability guarantee or shared application-wide quota enforcement. Each search may make up to two provider attempts; the app's daily counter limits logical searches rather than individual HTTP attempts.

### Applying and verifying native changes

JavaScript reloads cannot update Android backup, permission or signing configuration. Regenerate the existing native project without clearing it, then rebuild/install:

```sh
npx expo prebuild --platform android --no-clean --no-install
npm run android
```

SDK 57 prebuild defaults to recreating native folders; use `--no-clean` to preserve an existing project. This review checked fresh and repeated generation in an isolated directory, confirming backup exclusions, permission removal, HTTPS policy and absence of debug signing in the release block. The verified configuration was also applied to the existing local Android project with --no-clean. No new signed production build or store submission was made. The user's physical-phone error and iOS native behavior still require device verification.

The regression suite covers fallback, timeouts, cancellation, invalid provider responses, HTTPS enforcement, cache/filter behavior, invalid coordinates, contact links and incoming-link validation. All 52 mobile tests and TypeScript passed. Production JavaScript exports passed for Android, iOS and web. The built mobile browser app rejected a malformed incoming URL, preserved a valid encoded link and rendered without page errors. The web suite passed all 108 tests, including live Chromium security fixtures, and its production build passed. See [Expo permission configuration](https://docs.expo.dev/guides/permissions/) and [Android backup and transfer rules](https://developer.android.com/identity/data/autobackup) for the platform settings.
