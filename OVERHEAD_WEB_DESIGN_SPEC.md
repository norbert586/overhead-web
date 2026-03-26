# OVERHEAD — Web App Design Specification & Build Guide

**Version:** 3.0  
**Status:** Phase 0 Design Approved (Desktop Mockup v2)  
**Date:** March 21, 2026  
**Stack:** React / Vite / TypeScript (frontend) · Node / Express / TypeScript (backend) · SQLite (backend persistence)  
**Hosting:** Vercel (frontend) · Railway (backend)  
**Repo:** overhead-web

---

## 1. PRODUCT OVERVIEW

Overhead is a passive aircraft intelligence web app. It monitors the sky above a user's configured location using live ADS-B transponder data, enriches each detection with registry and route intelligence, classifies the flight, and presents the result as a full-viewport dashboard — one primary aircraft at a time, with session stats alongside.

**Core principle:** You hear a plane, you open the app, you know everything about it instantly.

**What makes it different:** No map-first interface. No social features. No clutter. Dense, utilitarian, instrument-panel data presentation. The app has *memory* — it tracks how many times it has seen each aircraft, building a personal intelligence log over time.

**User flow (v1):** User visits the site → opens Settings (hamburger menu) → enters coordinates and radius → saves → the app begins polling and displaying aircraft on the Flight screen. Settings persist in localStorage. No auth required for v1.

---

## 2. DESIGN SYSTEM

### 2.1 Color Palette

```
BACKGROUNDS
  --bg-primary:      #070a10    App background (dark navy)
  --bg-card:         #0a0e16    Card / cell background
  --bg-elevated:     #0d1219    Elevated surfaces (menu dropdown)
  --border:          #141c28    Card borders
  --border-subtle:   #101620    Dividers, subtle separators

ACCENT
  --accent:          #7eb8e0    Primary accent (cool blue)
  --accent-dim:      rgba(126,184,224,0.10)   Accent hover backgrounds
  --accent-micro:    rgba(126,184,224,0.04)   Subtle accent tints

CLASSIFICATION COLORS
  --class-commercial:  #5b9bd5   Blue
  --class-private:     #9b7ec8   Purple
  --class-government:  #d46b6b   Red
  --class-cargo:       #c4935a   Amber
  --class-military:    #d46b6b   Red (same as government)
  --class-unknown:     #5a6370   Gray

TEXT HIERARCHY
  --text-primary:    #c8d0da    Headings, callsign, primary values
  --text-secondary:  #586474    Labels, secondary info
  --text-dim:        #2c3644    Tertiary info, units, timestamps
  --text-ghost:      #1a2230    Barely visible decorative elements
```

### 2.2 Typography

| Role | Font | Weight | Size | Tracking | Color |
|------|------|--------|------|----------|-------|
| App name (top bar) | JetBrains Mono | 600 | 12px | 3px | text-primary |
| Callsign (hero) | JetBrains Mono | 700 | 44px | 6px | text-primary |
| Telemetry values | JetBrains Mono | 600 | 22px | 0.5px | accent |
| Times seen value | JetBrains Mono | 600 | 32px | — | accent |
| IATA codes | JetBrains Mono | 600 | 22px | 3px | text-primary |
| Stat card values | JetBrains Mono | 500 | 13px | — | text-primary |
| Photo overlays | JetBrains Mono | 600 | 13px / 11px | 2px / 1.5px | text-dim |
| Aircraft type | IBM Plex Mono | 400 | 12px | 2.5px | text-secondary |
| Section headers | IBM Plex Mono | 400 | 9px | 2px | text-dim |
| Data labels | IBM Plex Mono | 400 | 11px | 0.5px | text-secondary |
| Data values | IBM Plex Mono | 500 | 11px | 0.5px | text-primary |
| Stat labels | IBM Plex Mono | 400 | 10px | 0.5px | text-secondary |
| Classification badge | IBM Plex Mono | 400 | 9px | 2px | per-class color |
| Menu items | IBM Plex Mono | 400 | 11px | 1.5px | text-secondary |
| Scan status | IBM Plex Mono | 400 | 10px | 1.5px | text-dim |
| Bottom bar | IBM Plex Mono | 400 | 9px | 1px | text-dim |

**All text is uppercase except:** data values (owner name, city names), stat card values.

**Font loading:** Google Fonts via link tag in index.html:
```
IBM Plex Mono: 300, 400, 500, 600
JetBrains Mono: 300, 400, 500, 600, 700
```

### 2.3 Spacing & Layout

- Top bar height: 44px
- Bottom bar height: 28px
- Main content: fills viewport between top and bottom bars
- Main grid padding: 20px 28px
- Main grid gap: 20px
- Left column width: 320px (fixed)
- Right column width: 300px (fixed)
- Center column: flexible (1fr), fills remaining space
- Card internal padding: 12-14px
- Card border-radius: 3px
- Card border: 1px solid --border
- Telemetry grid gap: 1px
- Divider between identity and route: 1px solid --border-subtle, 20px margin top/bottom

---

## 3. SCREEN ARCHITECTURE

### 3.1 Desktop Layout — Full Viewport, Three Columns

```
┌─────────────────────────────────────────────────────────────┐
│ [✈ OVERHEAD] [● Tracking · 50nm · 12s]    [coords] [≡]    │  Top bar (44px)
├──────────────┬─────────────────────┬────────────────────────┤
│              │                     │                        │
│  CALLSIGN    │                     │  Times Seen: 17       │
│  Type        │   Aircraft Photo    │                        │
│  Operator    │   (fills height)    │  Session Stats         │
│  [COMMERCIAL]│                     │  - Total detected      │
│              │                     │  - Unique aircraft     │
│  ─────────── │                     │  - Active in range     │
│              │                     │                        │
│  JFK → SLC   │                     │  Classification        │
│  w/ flags    │                     │  - Commercial: 847     │
│              ├─────────────────────┤  - Private: 211        │
│  Intel Card  │  ALT  SPD  BRG DST │  - Cargo: 143          │
│  - Country   │ 32.4k 487  274° 4.2│  - Government: 46      │
│  - Reg       │  ft   kts   W   nm │                        │
│  - Hex       ├─────────────────────┤  Top Aircraft Today    │
│  - Type Code │                     │  - B737: 124           │
│  - Mfg       │                     │  - A320: 98            │
│              │                     │  - CRJ9: 67            │
├──────────────┴─────────────────────┴────────────────────────┤
│ OVERHEAD v1.0                              Last poll: 3s ago│  Bottom bar (28px)
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Navigation — Hamburger Menu (Top Right)

Clicking the hamburger opens a dropdown overlay anchored to top-right:
- Flight (active) — the main dashboard view
- Log — chronological detection history
- Settings — coordinates, radius, poll interval

Menu closes on selection or clicking outside.

### 3.3 Flight Screen Components

**Left Column — Identity & Intel**
- CallsignBlock: callsign with flanking dashes, aircraft type, operator row (logo + name), classification badge
- Divider
- RouteBlock: origin IATA → connector → destination IATA, city names, country flags
- IntelCard: Country (with flag), Registration, Hex, Type Code, Manufacturer

**Center Column — Visual & Telemetry**
- AircraftPhoto: fills available height (flex: 1), desaturated, gradient fades top/bottom, callsign overlay top-left, registration overlay bottom-right
- TelemetryGrid: 4 cells — Alt, Spd, Brg, Dist (fixed height below photo)

**Right Column — Stats & History**
- TimesSeenCard: label + large accent value
- SessionCard: total detected, unique aircraft, active in range
- ClassificationCard: breakdown by type with color dots
- TopAircraftCard: most common aircraft types today

### 3.4 Empty States

**No settings configured:** Full-screen centered message prompting user to open Settings.

**Settings configured, no aircraft:** Three-column layout with placeholder states. ScanBar shows "Monitoring" with pulsing dot. Stats show zeros.

### 3.5 Settings Screen

Replaces the three-column layout. Centered form (max-width 500px):

| Setting | Input Type | Default | Stored In |
|---------|-----------|---------|-----------|
| Latitude | Number input | — | localStorage |
| Longitude | Number input | — | localStorage |
| Radius (nm) | Number input | 25 | localStorage |
| Poll interval (sec) | Number input | 12 | localStorage |

Optional "Use my location" button (browser Geolocation API).
Save button persists and triggers polling.
All inputs styled to match dark console aesthetic.

### 3.6 Log Screen

Replaces the three-column layout. Full-width scrollable table of detections. Columns: timestamp, callsign, type, operator, classification, altitude, distance, times seen. Click a row to load that aircraft in the Flight view.

### 3.7 Mobile Layout (< 900px)

Three columns collapse to single scrollable column. Bottom bar hidden. Hamburger stays in top bar.

---

## 4. SYSTEM ARCHITECTURE

### 4.1 Data Flow

```
User opens app → reads settings from localStorage
  → Frontend polls backend every {pollInterval} seconds
    → GET /api/flights?lat={lat}&lon={lon}&radius={radius}
  → Backend receives request
    → Calls adsb.lol /v2/point/{lat}/{lon}/{radius}
    → For each aircraft:
        → Check aircraft_cache → miss? call adsbdb /v0/aircraft/{reg}
        → Check callsign_cache → miss? call adsbdb /v0/callsign/{cs}
        → Run classification engine
        → Update times_seen in flights table
    → Return enriched flight array + session stats
  → Frontend renders Flight screen
```

### 4.2 Backend API

```
GET /api/flights?lat={lat}&lon={lon}&radius={radius}
  Response: {
    flights: Flight[],
    stats: {
      total_detected: number,
      unique_aircraft: number,
      active_count: number,
      classification: { commercial, private, cargo, government: number },
      top_aircraft: { type: string, count: number }[]
    },
    timestamp: string
  }

GET /api/flights/:hex/history
  Response: { hex, times_seen, first_seen, last_seen }

GET /api/log?limit={n}&offset={n}
  Response: { flights: Flight[], total: number }
```

### 4.3 External APIs

| API | Purpose | Endpoint |
|-----|---------|----------|
| adsb.lol | Live ADS-B data | https://api.adsb.lol/v2/point/{lat}/{lon}/{radius} |
| adsbdb.com | Aircraft registry | https://api.adsbdb.com/v0/aircraft/{registration} |
| adsbdb.com | Route/callsign | https://api.adsbdb.com/v0/callsign/{callsign} |

All free, no API keys required.

### 4.4 Backend SQLite Schema

```sql
CREATE TABLE flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hex TEXT NOT NULL,
  registration TEXT,
  callsign TEXT,
  aircraft_type TEXT,
  manufacturer TEXT,
  owner TEXT,
  operator TEXT,
  country TEXT,
  origin_iata TEXT,
  origin_city TEXT,
  origin_country TEXT,
  destination_iata TEXT,
  destination_city TEXT,
  destination_country TEXT,
  altitude_ft INTEGER,
  speed_kts REAL,
  bearing_deg REAL,
  distance_nm REAL,
  classification TEXT DEFAULT 'unknown',
  times_seen INTEGER DEFAULT 1,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE aircraft_cache (
  registration TEXT PRIMARY KEY,
  aircraft_type TEXT,
  manufacturer TEXT,
  owner TEXT,
  country TEXT,
  photo_url TEXT,
  cached_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE callsign_cache (
  callsign TEXT PRIMARY KEY,
  operator TEXT,
  origin_iata TEXT,
  origin_city TEXT,
  origin_country TEXT,
  destination_iata TEXT,
  destination_city TEXT,
  destination_country TEXT,
  cached_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_flights_hex ON flights(hex);
CREATE INDEX idx_flights_last_seen ON flights(last_seen);
CREATE INDEX idx_flights_classification ON flights(classification);
```

### 4.5 Classification Engine

| Priority | Class | Detection Method |
|----------|-------|-----------------|
| 1 | Government / Military | Owner keywords, callsign prefixes (RCH, SAM, SPAR, REACH) |
| 2 | Commercial | Has airline name, excludes known cargo operators |
| 3 | Cargo | Cargo keywords, cargo-typical type codes (B763, MD11) |
| 4 | Private | Charter operators, owner patterns (LLC, Inc, Trust), business jet codes |
| 5 | Unknown | No matching patterns |

---

## 5. PROJECT STRUCTURE

```
overhead-web/
├── README.md
├── OVERHEAD_WEB_DESIGN_SPEC.md
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   └── flights.ts
│   │   ├── services/
│   │   │   ├── adsb.ts
│   │   │   ├── enrichment.ts
│   │   │   └── classifier.ts
│   │   ├── database/
│   │   │   ├── db.ts
│   │   │   ├── migrations.ts
│   │   │   └── queries.ts
│   │   ├── types/
│   │   │   └── flight.ts
│   │   └── utils/
│   │       ├── distance.ts
│   │       └── flags.ts
│   └── data/
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── App.css
│       ├── components/
│       │   ├── TopBar.tsx
│       │   ├── HamburgerMenu.tsx
│       │   ├── BottomBar.tsx
│       │   ├── CallsignBlock.tsx
│       │   ├── AircraftPhoto.tsx
│       │   ├── RouteBlock.tsx
│       │   ├── TelemetryGrid.tsx
│       │   ├── IntelCard.tsx
│       │   ├── TimesSeenCard.tsx
│       │   ├── SessionCard.tsx
│       │   ├── ClassificationCard.tsx
│       │   ├── TopAircraftCard.tsx
│       │   ├── ClassificationBadge.tsx
│       │   ├── OperatorRow.tsx
│       │   └── EmptyState.tsx
│       ├── screens/
│       │   ├── FlightScreen.tsx
│       │   ├── LogScreen.tsx
│       │   └── SettingsScreen.tsx
│       ├── hooks/
│       │   ├── useFlightData.ts
│       │   └── useSettings.ts
│       ├── services/
│       │   └── api.ts
│       ├── theme/
│       │   ├── colors.ts
│       │   ├── typography.ts
│       │   └── spacing.ts
│       ├── types/
│       │   └── flight.ts
│       └── utils/
│           └── formatting.ts
│
└── shared/
    └── types.ts
```

---

## 6. BUILD PHASES

### Phase 0 — Foundation (DONE)
- [x] Design system defined
- [x] Desktop mockup approved (v2)
- [x] Architecture finalized
- [x] Project structure planned

### Phase 1 — Project Setup & Static Frontend
- [ ] Create overhead-web repo on GitHub
- [ ] Initialize frontend (Vite + React + TypeScript)
- [ ] Set up CSS variables and font imports
- [ ] Build theme files
- [ ] Build TopBar + HamburgerMenu + BottomBar
- [ ] Build all Flight screen components with mock data
- [ ] Compose FlightScreen (three-column grid)
- [ ] Build EmptyState
- [ ] Build SettingsScreen
- [ ] Verify desktop and mobile layouts

### Phase 2 — Backend Foundation
- [ ] Initialize backend (Express + TypeScript + SQLite)
- [ ] Build adsb.lol API client
- [ ] Build /api/flights endpoint
- [ ] Connect frontend to backend

### Phase 3 — Enrichment & Intelligence
- [ ] adsbdb.com enrichment with caching
- [ ] Classification engine
- [ ] times_seen tracking
- [ ] Session stats
- [ ] Aircraft photos
- [ ] Full enriched rendering

### Phase 4 — Log Screen & Polish
- [ ] Log screen
- [ ] Click-to-detail
- [ ] Operator logos
- [ ] Data retention
- [ ] Loading/error states
- [ ] Mobile polish

### Phase 5 — Deploy
- [ ] Frontend to Vercel
- [ ] Backend to Railway
- [ ] Environment variables
- [ ] End-to-end testing

---

## 7. CLAUDE CODE WALKTHROUGH

### Step 1 — Create the Repo

```bash
mkdir overhead-web
cd overhead-web
git init
```

Place OVERHEAD_WEB_DESIGN_SPEC.md and overhead-desktop-mockup-v2.html in project root.

### Step 2 — Open Claude Code

```bash
cd overhead-web
claude
```

### Step 3 — First Prompt

```
Read the file OVERHEAD_WEB_DESIGN_SPEC.md in this directory. This is the
complete design specification for the app we're building. Don't build
anything yet — just confirm you've read it and tell me what you understand
the project to be.
```

### Step 4 — Initialize Frontend

```
We are ONLY setting up the frontend right now. Do NOT build the backend.

Initialize the frontend:
1. Create the frontend/ directory
2. Initialize a Vite + React + TypeScript project inside it
3. Set up App.css with all CSS variables from section 2.1
4. Add Google Font imports for IBM Plex Mono and JetBrains Mono
5. Create theme files (colors.ts, typography.ts, spacing.ts)
6. Create placeholder stub files for every component, screen, hook,
   service, type, and util in the project structure
7. Set up App.tsx with view routing state (flight/log/settings)

Do not build any component UI yet. Just the skeleton and theme.
Stop when done so I can verify.
```

### Step 5 — Build Components One at a Time

Build order:
1. TopBar + HamburgerMenu + BottomBar
2. CallsignBlock + ClassificationBadge + OperatorRow
3. AircraftPhoto
4. RouteBlock
5. TelemetryGrid
6. IntelCard
7. TimesSeenCard + SessionCard + ClassificationCard + TopAircraftCard
8. FlightScreen (compose three-column grid)
9. EmptyState
10. SettingsScreen

### Key Rules
- Keep this spec in project root — reference it in every prompt
- One component per prompt
- Test in browser after each component
- All components use hardcoded mock data until Phase 2
- Don't let Claude Code jump ahead or make assumptions

---

## 8. API RESPONSE SHAPES

### adsb.lol
```json
{
  "ac": [{
    "hex": "a7c3b2", "flight": "MXY293 ", "r": "N577N", "t": "A388",
    "alt_baro": 32400, "gs": 487.2, "track": 274.1,
    "lat": 42.685, "lon": -83.102, "dst": 4.2
  }]
}
```

### adsbdb.com Aircraft
```json
{
  "response": {
    "aircraft": {
      "type": "A388", "manufacturer": "Airbus", "registration": "N577N",
      "registered_owner_country_iso_name": "MX",
      "registered_owner_country_name": "Mexico",
      "registered_owner": "Mexico Airlines",
      "url_photo": "https://..."
    }
  }
}
```

### adsbdb.com Callsign
```json
{
  "response": {
    "flightroute": {
      "callsign": "MXY293",
      "airline": { "name": "Mexico Airlines", "icao": "MXY", "country_name": "Mexico" },
      "origin": { "iata_code": "JFK", "municipality": "New York", "country_iso_name": "US" },
      "destination": { "iata_code": "SLC", "municipality": "Salt Lake City", "country_iso_name": "US" }
    }
  }
}
```

---

## 9. VISUAL REFERENCE

The approved desktop mockup (overhead-desktop-mockup-v2.html) is the definitive
visual reference. All components should match that mockup when rendered.
