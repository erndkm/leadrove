# Leadrove

Find your next local client. The project has two application folders:

```text
clientFinder/
  web/       Website and local AI review service
  mobile/    Shared iOS and Android app (Expo / React Native)
  shared/    Place normalization and suggestion ranking used by both apps
```

The apps share the Leadrove identity: Manrope typography, forest green accents, neutral surfaces and clear business type labels. Dependencies and build outputs stay separate.

## Website

```sh
cd web
npm install
npm run dev
```

The website includes area search, website reviews, daily prospecting, pipeline and proposal workflows. See [web/README.md](web/README.md) for provider setup, local service access, data handling and deployment.

## Mobile

```sh
cd mobile
npm install
npm start
```

One app supports iOS and Android, with Today, Nearby, Discover and Saved tabs. Optional daily GPS discovery finds relevant businesses along your day, delivers device notifications and records nearby encounters. Start and pause controls, permission disclosures and daily alert limits are built in.

Background GPS needs a development build: `npm run dev:android`, or `npm run dev:ios` on a Mac with Xcode. Expo Go and the browser preview support UI and foreground testing. See [mobile/README.md](mobile/README.md) for setup, background behavior and device verification.

## Commands from this folder

Use Node 22.23.3+ or 24.21.0+. Install each app's dependencies in its own folder first.

| Command | Action |
| --- | --- |
| `npm run web:dev` | Start the website |
| `npm run web:build` | Build the website |
| `npm run web:test` | Test website behavior |
| `npm run mobile` | Start Expo |
| `npm run mobile:android` | Build and open the Android app |
| `npm run mobile:ios` | Build and open the iOS app on a Mac |
| `npm run mobile:check` | Type-check the app |
| `npm run mobile:test` | Test discovery logic |

The app stores leads on the device; automatic website-to-phone syncing is not configured. Product and visual decisions are in [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md).
