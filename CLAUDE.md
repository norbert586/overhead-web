# Overhead — notes for Claude Code sessions

Live flight "catching" app: open it when you hear a plane, it records every aircraft inside your hearing radius. Production: https://overheadflight.com (single DigitalOcean droplet, nginx → Express on :3001 via pm2, frontend static from `frontend/dist`, Cloudflare in front). `ARCHITECTURE.md` describes an older Python version — trust the code and this file.

## Layout

- `backend/` — Express + TypeScript + better-sqlite3 (sync DB calls).
  - `src/services/adsb.ts` — live feed: one 50 nm fetch per ~1 nm grid cell, shared + cached 5 s, served stale ≤ 45 s if every provider fails; providers raced (next one starts after 1.5 s), 4 s timeout, 60 s cooldown.
  - `src/services/enrichment.ts` — adsbdb lookups: deduped, ≤ 6 concurrent, circuit breaker; only 404/400 are cached as misses.
  - `src/services/photos.ts` + `src/routes/photos.ts` — `GET /api/photos`: every photo worth trying for an aircraft, best first. Exact airframe (Planespotters by reg then hex, Airport-Data, in parallel; cached per hex 24 h, misses 12 h) → same-model stand-in from our own pool, same airline first → Wikimedia Commons reference photo of the type (always appended last; cached per type 30 d). Each candidate carries credit, link-back page and `focus` (aircraft bounding box). `complete: false` = a provider couldn't be asked; the browser then tries Planespotters itself. `POST /api/photos/broken` re-checks a dead URL from the server and purges it.
  - `src/services/photoFocus.ts` — finds the aircraft in a JPEG (background-connectivity saliency, no ML), cached per URL. Fails wide: too big a box only costs zoom; it must never crop the aircraft. Tests: `npm test`.
  - `src/routes/flights.ts` — `GET /api/flights`, the catch poll. Records only aircraft inside the hearing radius, never from a stale snapshot or the display-only 25/50 nm expansion.
  - `src/services/diagnostics.ts` + `src/routes/diagnostics.ts` — in-memory log ring, per-minute metrics, poll log, client error reports, live probe.
- `frontend/` — React 19 + Vite PWA. Design: VFR-sectional "day chart" and a navy "night chart" (dark mode); B612 for text, Barlow Condensed for callsigns/codes/big numbers, B612 Mono only for registrations and hex; sentence case everywhere except things that are capitals in the world (callsigns, airport codes). `src/hooks/useTheme.ts` + the inline script in `index.html` pick the theme before first paint (device / follow the sun / light / dark — keep both in sync). Colours are tokens in `App.css` `:root` and `:root[data-theme="dark"]`; translucent tints are written `rgb(var(--x-rgb) / a)` so one rule serves both themes — never hard-code a hex in a rule. `src/components/SkyDome.tsx` + `src/utils/sky.ts`: the "where to look" fisheye of your sky, tinted by the real sun altitude at the catch point, aircraft placed by `azimuthDeg` (from `/api/flights`) and height above the horizon. `src/hooks/useFlightData.ts` is the poll loop (one request at a time, 15 s timeout, backoff, keeps last data 45 s marked delayed). `src/utils/diagnostics.ts` is the client event ring + error reporting. Ambient/decorative effects draw through `src/components/ChartCanvas.tsx` (sizing, pixel-ratio cap, theme tokens via `utils/themeTokens.ts`, still frame when motion is off) on `src/hooks/useAnimationFrame.ts` (≤ 30 fps, paused when hidden/offscreen/reduced motion); never a bare rAF loop or a hex colour in canvas code. `?motion=off` (`utils/motion.ts`, kept for the tab session) freezes canvas loops and CSS keyframes but not View Transitions; e2e runs with it. Photos: `src/utils/photos.ts` (client for `/api/photos`, credits/labels), `src/components/SmartPhoto.tsx` (walks candidates on load error), `src/utils/photoLayout.ts` (frames the aircraft for any box shape; letterboxes over a blurred copy rather than crop it). Share catch: `src/utils/shareCatch.ts` builds the text message (everyday units, one link, never the user's location or emergency squawks), `src/components/ShareCatch.tsx` is the button + preview sheet (catch screen and log rows). The link unfurls from the Open Graph tags in `index.html` + `public/og-image.png`.
- `VERSION` — the release (semver) shown in the app and `/api/health`. The changelog bot bumps it on every merged PR: `major`/`breaking` label → major, `patch`/`fix`/`bug` label or a title starting Fix/Hotfix/Repair → patch, else minor; it also tags `vX.Y.Z`. Don't bump it by hand in a PR.
- `scripts/e2e.mjs` — full-stack browser test. `backend/scripts/` — mock upstreams + smoke test.

## Verify before pushing

CI (`.github/workflows/ci.yml`) runs these on every PR and gates every deploy:

```bash
cd backend  && npm run typecheck && npm run lint && npm test && npm run build
cd frontend && npm run lint && npm run build
```

Behavioural checks (no network needed — mock upstreams):

```bash
# Full stack in headless mobile Chromium: healthy feed, diagnostics panel, feed outage,
# recovery, admin System tab, offline, rejected session. ~2.5 min. Screenshots path printed.
node scripts/e2e.mjs

# Against a running backend (see "Run locally"):
cd backend && BASE=http://localhost:3001 INVITE_CODE=<server's code> npm run smoke
```

## Run locally, offline

```bash
cd backend && npm run mock-feed      # :4555 — fake ADS-B feed, adsbdb and photo providers; flip modes:
                                     # curl localhost:4555/__mode?mode=ok|empty|slow|down|garbage
                                     # curl localhost:4555/__photos?mode=ok|none|down|broken
cd backend && JWT_SECRET=dev INVITE_CODE=dev DB_PATH=/tmp/overhead-dev.db npm run dev:mock   # :3001
cd frontend && VITE_API_URL=http://localhost:3001 npm run dev                                # :5174
```

## Debugging production — fastest path first

1. **Health** (public): `curl -s https://overheadflight.com/api/health` → `status` ok/degraded (user-impacting `problems`, plus non-impacting `warnings`) in plain words, deployed `version.commit`, per-provider last success/error, poll outcomes in the last 5 min.
2. **Full diagnostics** (needs `DIAGNOSTICS_KEY` from the server's `backend/.env`, e.g. given to the session as an environment secret):
   `cd backend && BASE=https://overheadflight.com DIAGNOSTICS_KEY=$DIAGNOSTICS_KEY npm run smoke` — read-only against prod; prints metrics, recent server errors, client error reports and a **live probe** of every upstream from the server.
3. **Ask the user** for Menu → **Diagnostics** → **Copy report** (or `?debug` in the URL) and to paste it: app + server build (mismatch = stale cached app), session expiry, GPS fix, last poll result with its request id, recent client events.
4. **Admin → System** tab (admins): the same server view in the app, with a Run-live-probe button.
5. **Request ids**: error screens show `ref <id>`; responses carry `X-Request-Id`; server logs have `reqId`. On the box: `pm2 logs overhead-backend --lines 500 --nostream | grep <id>`.

Cloud sessions are often blocked from `overheadflight.com` and the ADS-B hosts by the environment's network policy (proxy answers 403 "Host not in allowlist"). If so, ask the user to add the domains under the environment's Network access settings, or to paste `/api/health` / a diagnostics report.

### What the user sees → where to look

| On screen | Client error kind | Meaning / first check |
|---|---|---|
| "Live feeds not answering" | `upstream` (our JSON 502 `upstream_unavailable`) | Every ADS-B provider failed. Live probe; provider `lastError`. |
| "Reconnecting to Overhead" | `server` (bare 5xx from nginx/Cloudflare, or 500 `server_error`) | Backend down or restarting. `pm2 status`, `pm2 logs`. |
| "No connection" / "Slow connection" | `offline` / `timeout` | Client network. Not a server problem. |
| Sign-in screen "session expired" | `auth` (any 401) | Token expired/invalid → app signs out. `auth_expired` count in diagnostics. |
| Top bar "Reconnecting…" + "Feed delayed" note | stale data | Polls failing, last data < 45 s old still shown. |

## Invariants that have bitten us

- adsb.lol `/v2/closest` returns **one** aircraft. Always `/v2/point` (all in radius). `ADSB_BASE_URL` overrides the primary.
- nginx forwards only `/api/*` to Express. New server endpoints go under `/api`.
- Every error response carries `{ error, code }`; the client maps codes to messages (`frontend/src/services/api.ts`). Keep codes stable — diagnostics count them.
- Any 401 from an authenticated call signs the user out (`AUTH_EXPIRED_EVENT`). Don't return 401 for anything but a bad/missing session.
- `/api/health` must stay HTTP 200 while the process is up — the deploy health check uses `curl -f`. Degradation goes in the body.
- Deploys build the frontend into `dist-next` and swap; never build straight into `dist` (it empties first → site down). Old hashed assets are kept 7 days for open tabs.
- The bottom status bar is `display: none` at ≤ 900 px; phones get `TabBar` (Catch, Log, Hangar, Stats) instead. Every screen must still be reachable from the hamburger menu (tests select `.menu-item` by label — the catch screen's item is "Catch").
- Screen changes and switching aircraft run inside View Transitions (`utils/motion.ts`), so the DOM updates a frame after the tap. Tests must wait for the result (e.g. the row's `aria-pressed="true"`), not read straight after `click()`.
- Hamburger menu items are clickable `<div>`s, not buttons — select them by `.menu-item` in tests.
- Planespotters' terms: show their thumbnail URL unchanged (never rewrite it for a bigger size), link the photo to its photo page, credit the photographer visibly next to it, and keep photo areas free to view (not member-only). Requests must identify themselves (User-Agent server-side, Origin/Referer in the browser).

## Session gotchas

- `pkill -f <pattern>` matches your own shell command line and kills it. Track pids (`echo $! > pidfile`) instead.
- After stopping the backend wait for it to exit (graceful shutdown takes ~1.5 s) before restarting on the same port, or you'll talk to the old process.
- `DB_PATH=/tmp/…` keeps experiments out of `backend/data/overhead.db`.
- Playwright + Chromium are preinstalled in cloud sessions (global `playwright`, `/opt/pw-browsers`); never run `playwright install`.
- `.claude/hooks/session-start.sh` installs both projects' deps at session start (cloud only).

## Conventions

- Comments explain *why* (the incident, the trade-off), not what. Match that density.
- Branches `claude/<topic>`, merged via PR; `CHANGELOG.md` is appended automatically on merge — don't edit it by hand.
