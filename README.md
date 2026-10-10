# PitchPlay Cricket Score Studio 🏏

A responsive, offline-first cricket scoring website with a team-colour scorecard, live batter/bowler highlights, player-career analytics, Test match support, match history, scorecard printing, and local data recovery.

## Deploy to Netlify

**One-click import:** [Deploy PitchPlay to Netlify](https://app.netlify.com/start/deploy?repository=https://github.com/pustakparables1409-debug/pitchplay-cricket-scorebook)

1. Open the deploy link and sign in to Netlify.
2. Authorize Netlify to read this repository.
3. Keep the publish directory as `.` (already configured in `netlify.toml`).
4. Click **Deploy**. Netlify will provide a public HTTPS `netlify.app` URL.
5. Open that URL on phone, tablet and desktop and test scoring before using it for an important match.

Netlify can redeploy automatically whenever changes are pushed to the `main` branch.

## Files

- `index.html` — PitchPlay app (compressed bootloader that expands the full app in current browsers)
- `manifest.webmanifest` — installable web app metadata
- `pitchplay-icon.svg` — app icon
- `sw.js` — versioned offline app-shell cache
- `netlify.toml` and `_headers` — static hosting setup

## Important data note

Teams, players and matches are saved per browser/device. This static deployment does **not** synchronize match data automatically between different devices; cross-device live sync requires a shared backend. Export important match backups regularly.

## Browser compatibility

Use a current version of Chrome, Edge, Firefox or Safari for the best experience. The hosted site requires HTTPS for service-worker/PWA features. No web app can guarantee operation on every outdated browser or every device.
