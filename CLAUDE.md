# Overhead — notes for Claude Code sessions

Live flight "catching" app: open it when you hear a plane, it records every aircraft inside your hearing radius. Production: https://overheadflight.com (single DigitalOcean droplet, nginx → Express on :3001 via pm2, frontend static from `frontend/dist`, Cloudflare in front). `ARCHITECTURE.md` describes an older Python version — trust the code and this file.

## Layout

- `backend/` — Express + TypeScript + better-sqlite3 (sync DB calls).
  - `src/services/adsb.ts` — live feed: one 50 nm fetch per ~1 nm grid cell, shared + cached 5 s, served stale ≤ 45 s if every provider fails; providers raced (next one starts after 1.5 s), 4 s timeout, 60 s cooldown.
  - `src/services/enrichment.ts` — adsbdb lookups: deduped, ≤ 6 concurrent, circuit breaker; only 404/400 are cached as misses.
  - `src/routes/flights.ts` — `GET /api/flights`, the catch poll. Records only aircraft inside the hearing radius, never from a stale snapshot or the display-only 25/50 nm expansion.
  - `src/services/diagnostics.ts` + `src/routes/diagnostics.ts` — in-memory log ring, per-minute metrics, poll log, client error reports, live probe.
- `frontend/` — React 19 + Vite PWA. `src/hooks/useFlightData.ts` is the poll loop (one request at a time, 15 s timeout, backoff, keeps last data 45 s marked delayed). `src/utils/diagnostics.ts` is the client event ring + error reporting.
- `scripts/e2e.mjs` — full-stack browser test. `backend/scripts/` — mock upstreams + smoke test.

## Verify before pushing

CI (`.github/workflows/ci.yml`) runs these on every PR and gates every deploy:

```bash
cd backend  && npm run typecheck && npm run lint && npm run build
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
cd backend && npm run mock-feed      # :4555 — fake ADS-B feed + adsbdb; flip modes:
                                     # curl localhost:4555/__mode?mode=ok|empty|slow|down|garbage
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
- The bottom bar is `display: none` at ≤ 900 px. Phone-reachable entry points belong in the hamburger menu.
- `--panel-bg` is never defined: `.auth-card`, `.s-card`, `.chart-tooltip` render transparent (left as-is; design call).
- Hamburger menu items are clickable `<div>`s, not buttons — select them by `.menu-item` in tests.

## Session gotchas

- `pkill -f <pattern>` matches your own shell command line and kills it. Track pids (`echo $! > pidfile`) instead.
- After stopping the backend wait for it to exit (graceful shutdown takes ~1.5 s) before restarting on the same port, or you'll talk to the old process.
- `DB_PATH=/tmp/…` keeps experiments out of `backend/data/overhead.db`.
- Playwright + Chromium are preinstalled in cloud sessions (global `playwright`, `/opt/pw-browsers`); never run `playwright install`.
- `.claude/hooks/session-start.sh` installs both projects' deps at session start (cloud only).

## Conventions

- Comments explain *why* (the incident, the trade-off), not what. Match that density.
- Branches `claude/<topic>`, merged via PR; `CHANGELOG.md` is appended automatically on merge — don't edit it by hand.
