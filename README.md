# Overhead

**Live aircraft intelligence for the skies above you.**

Overhead is a personal flight tracking dashboard that tells you exactly what's flying over your location — who operates it, where it came from, where it's going, and whether you've seen it before. It pulls real-time ADS-B transponder data, enriches it with aircraft registry and route information, classifies every contact by type, and builds a persistent history over time.

Live at [overheadflight.com](https://overheadflight.com)

---

## What it does

Overhead works like catching: you have to be there. Open the app when you hear a plane, and it grabs your live location and listens. While the page is open and visible, every aircraft that enters your hearing radius (1–15 nm, you choose) gets caught — looked up, classified, and saved to your log:

1. **Looks up the registration** against the aircraft registry to find manufacturer, owner, and country of origin
2. **Looks up the callsign** to find the operating airline and origin/destination airports
3. **Classifies the flight** — Commercial, Cargo, Government/Military, Private, or Unknown — using a priority-based rule engine
4. **Catches it** — saves the sighting to a local SQLite database tied to your account, with a NEW badge for first-ever airframes
5. **Displays it** in a clean dashboard with telemetry, photo, and session stats

Leave the page and you stop catching — stats are built only from flights you were actually there for. If your device can't share its location (desktop browsers, denied permissions), a saved home location acts as the fallback catch point. There is no background scanning: the server only touches the ADS-B feed while someone actually has the app open.

The result: you hear a rumble, open your phone, and catch UAL2044 — a United 737 — climbing out of Newark, heading to Denver, 3.2 nm west. You've caught it once before.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | CSS custom properties, no framework |
| Charts | Recharts |
| Maps | Leaflet + CartoDB dark tiles |
| Backend | Node.js, Express 4, TypeScript |
| Database | SQLite via sql.js (file-persisted) |
| Auth | JWT + bcrypt, invite-code registration |
| Deployment | DigitalOcean + nginx + PM2 |
| CI/CD | GitHub Actions (push to main → auto-deploy) |
| DNS/CDN | Cloudflare (proxy, HTTPS, DDoS) |

External data sources:
- [adsb.lol](https://adsb.lol) — real-time ADS-B aircraft positions (primary)
- [adsb.fi](https://adsb.fi) and [airplanes.live](https://airplanes.live) — automatic fallbacks when the primary feed is unreachable
- [adsbdb.com](https://adsbdb.com) — aircraft registry and route lookups (cached)

---

## Running locally

**Prerequisites:** Node.js 20+

```bash
# Clone
git clone https://github.com/norbert586/overhead-web.git
cd overhead-web

# Backend
cd backend
cp .env.example .env        # set JWT_SECRET and INVITE_CODE
npm install
npm run dev                 # starts on :3001

# Frontend (new terminal)
cd frontend
npm install
npm run dev                 # starts on :5174
```

Open `http://localhost:5174`, register with your invite code, set your location in Settings, and you're live.

---

## Project structure

```
overhead-web/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express entry point
│   │   ├── routes/               # auth, flights, stats
│   │   ├── services/
│   │   │   ├── adsb.ts           # ADS-B feed polling with provider failover
│   │   │   ├── enrichment.ts     # aircraft registry + route lookups
│   │   │   └── classifier.ts     # flight type classification engine
│   │   ├── database/
│   │   │   ├── db.ts             # sql.js init + persistence
│   │   │   ├── migrations.ts     # schema migrations
│   │   │   └── queries.ts        # typed query functions
│   │   └── middleware/
│   │       └── auth.ts           # JWT validation
│   └── data/
│       └── overhead.db           # SQLite database (gitignored)
│
└── frontend/
    └── src/
        ├── screens/              # FlightScreen, LogScreen, StatsScreen,
        │                         # SettingsScreen, LoginScreen, RegisterScreen
        ├── components/           # TopBar, MapCard, HamburgerMenu, EmptyState
        ├── hooks/                # useFlightData, useAuth, useSettings
        ├── services/             # api.ts (all backend calls)
        ├── utils/                # formatting, airline logos, country flags
        └── theme/                # design tokens (colors, spacing, typography)
```

---

## Deployment

Production runs on a single DigitalOcean droplet:

```
Internet → Cloudflare (DNS + SSL) → nginx (:80)
                                       ├── /api/* → Express (:3001) via PM2
                                       └── /*     → Vite build (static files)
```

Every push to `main` triggers the GitHub Actions deploy workflow:
1. SSH into the server
2. `git pull origin main`
3. Rebuild backend (`tsc`) and restart PM2
4. Rebuild frontend (`vite build`)

Environment variables required on the server (`backend/.env`):
```
JWT_SECRET=<long random string>
INVITE_CODE=<code you share with users>
APP_URL=https://overheadflight.com

# Email — required for welcome, password-reset, and verification emails
RESEND_API_KEY=<resend api key>
EMAIL_FROM=Overhead <noreply@overheadflight.com>
```

Without `RESEND_API_KEY` (or `SMTP_HOST` as a fallback), outbound emails are
logged but never delivered — the server prints a warning at startup. See
`backend/.env.example` for the full list.

To add a new user: share the `INVITE_CODE`. Registration is otherwise closed.

---

## Account setup flows

| Flow | Endpoint | Email sent |
|---|---|---|
| Register | `POST /api/auth/register` | Welcome + email verification link |
| Forgot password | `POST /api/auth/forgot-password` | One-hour reset link (always returns 200 to prevent email enumeration) |
| Reset password | `POST /api/auth/reset-password` | none — single-use token consumed |
| Verify email | `POST /api/auth/verify-email` | none — sets `email_verified_at` |
| Re-send verification | `POST /api/auth/resend-verification` | Verification link |

Reset and verification tokens are 32-byte URLs stored as SHA-256 hashes
(plaintext only lives in the email). Reset tokens expire in 1 hour;
verification tokens in 7 days. Both are single-use.

---

## Classification engine

Flights are classified in priority order. First match wins.

| Class | Logic |
|---|---|
| **Government / Military** | Callsign prefix matches known military codes (RCH, SAM, SPAR, REACH, etc.) or owner contains military/government keywords |
| **Cargo** | Operator is a known cargo carrier (FedEx, UPS, DHL, Atlas Air, etc.) or aircraft type is a dedicated freighter |
| **Commercial** | Any scheduled airline operation |
| **Private** | Known charter operators (NetJets, Flexjet) or business jet type codes |
| **Unknown** | No match |

---

## Data model

Every detected flight is stored per-user with full enrichment:

- Hex code, registration, callsign, aircraft type
- Manufacturer, owner, operator, country
- Origin / destination airports and cities
- Altitude, speed, bearing, distance at time of detection
- Classification, times seen, first seen, last seen

Aircraft registry and callsign lookups are cached indefinitely to avoid hammering external APIs.

---

## Roadmap

The app works. Here's where it's going.

### Near term

**Mobile map** — the Leaflet map renders correctly on desktop but is blank on mobile due to a Leaflet initialization timing issue in scroll context. Replacing with a static SVG radar visualization or resolving the tile render bug.

**Browser icon** — favicon deployed but browser cache serving the old Vite default. Cache-bust fix pending.

**Visual database browser** — currently the only way to inspect flight data is the terminal. Adding a simple read-only admin view or supporting TablePlus/DB Browser via file export.

### Medium term

**Themes** — the design system is already built on CSS custom properties. Light mode, high-contrast, and alternate accent color themes are straightforward to wire up. Toggle in Settings.

**Saved flights** — flag individual flights as notable. Your saved contacts persist across sessions with personal notes. Useful for logging unusual military traffic, rare aircraft types, or just memorable sightings.

**Airport tracking mode** — instead of a radius around your location, monitor a specific airport. See all arrivals and departures in real time, track delays, and build a history of traffic at a given field.

**User profile screen** — currently accounts exist for auth only. A profile page showing total flights logged, most seen aircraft, personal records (highest altitude, fastest aircraft, farthest contact), and account management.

### Longer term

**Improved UI polish** — the core layout is solid but there's room to tighten spacing, improve the mobile experience further, and add subtle motion to data updates.

**Alert system** — notify when specific registrations, operators, or aircraft types enter your radius. Push notifications or in-app alerts for high-interest contacts.

**Multi-location** — monitor more than one observer location and switch between them. Useful if you travel and want history from multiple home bases.

**Sharing** — generate a public read-only link to your current session so you can show someone what's overhead right now without giving them your account.

---

Built with curiosity about what's flying 35,000 feet above the backyard.
