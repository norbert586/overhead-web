# Overhead – Backend Architecture

## Overview
Local-first aircraft proximity tracker. Polls a public ADS-B feed, enriches aircraft data, classifies flights, stores everything in SQLite, and exposes a JSON API consumed by a React frontend.

- **Backend**: Python 3.10+, Flask 3.0, SQLite, Gunicorn
- **Frontend**: React 19, Vite 7, Leaflet
- **Ports**: API on `:8080`, Vite dev server on `:5173`

---

## Directory Layout

```
overhead/
├── backend/
│   ├── wsgi.py              # Gunicorn entry point (production)
│   ├── requirements.txt     # flask, requests, python-dotenv, flask-cors, gunicorn
│   ├── migrate_airports.py  # One-time script: loads ~7k airports from OpenFlights CSV
│   └── app/
│       ├── main.py          # Flask factory, thread startup, SPA fallback route
│       ├── config.py        # Loads .env into module-level constants
│       ├── db.py            # Schema, init_db(), log_flight(), classify_flight(), cache helpers
│       ├── ingest.py        # Background thread: polls adsb.lol every POLL_SECONDS
│       ├── enrich.py        # HTTP wrappers for adsbdb.com (aircraft + callsign)
│       ├── classifier.py    # Background thread: re-classifies unclassified rows every 30s
│       └── api.py           # All Flask routes (Blueprint)
└── frontend/
    └── src/
        ├── App.jsx          # Live feed, search, keyboard nav, photo loading
        ├── Stats.jsx        # Stats dashboard (charts, breakdowns)
        └── RouteMap.jsx     # Leaflet map with color-coded routes
```

---

## Configuration (`app/config.py`)

Loaded from `backend/.env` via `python-dotenv`.

| Variable | Default | Description |
|---|---|---|
| `ME_LAT` | `42.7077` | Observer latitude |
| `ME_LON` | `-83.0315` | Observer longitude |
| `RADIUS_NM` | `50` | Detection radius (nautical miles) |
| `POLL_SECONDS` | `12` | ADS-B poll interval |
| `EVENT_WINDOW_MINUTES` | `20` | Gap before same aircraft creates a new event row |
| `DB_PATH` | `backend/data/flight_log.db` | SQLite file path |

---

## Database Schema (`app/db.py`)

### `flights` — main event log
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
seen_at TEXT, hex TEXT, reg TEXT, callsign TEXT, type_code TEXT,
model TEXT, manufacturer TEXT, owner TEXT,
country TEXT, country_iso TEXT,
airline_name TEXT,
origin_iata TEXT, origin_name TEXT, dest_iata TEXT, dest_name TEXT,
altitude_ft REAL, ground_speed_kt REAL, distance_nm REAL, heading_deg REAL,
event_key TEXT,        -- "{hex}|{reg}|{callsign}" dedup key
first_seen TEXT, last_seen TEXT,
times_seen INTEGER DEFAULT 1,
classification TEXT    -- commercial | private | government | cargo | unknown
```

### `aircraft_cache` — avoids repeat registry lookups
```sql
reg TEXT PRIMARY KEY, type_code, model, manufacturer, owner,
country, country_iso, updated_at
```

### `callsign_cache` — avoids repeat route lookups
```sql
callsign TEXT PRIMARY KEY, airline_name,
origin_iata, origin_name, dest_iata, dest_name, updated_at
```

### `airports` — reference data (IATA → coordinates)
```sql
iata_code TEXT PRIMARY KEY, name, city, country, latitude, longitude
```
Populated once via `python migrate_airports.py` (downloads OpenFlights CSV).

**Migration**: `init_db()` runs `ALTER TABLE flights ADD COLUMN classification` if missing. Called on every startup and inside every `log_flight()` call.

---

## Startup Sequence

### Development (`python -m app.main`)
```
init_db()
→ threading.Thread(ingestion_loop, daemon=True).start()
→ threading.Thread(classification_loop, daemon=True).start()
→ app.run(host=0.0.0.0, port=8080, debug=True, use_reloader=False)
```

### Production (`gunicorn --workers 1 wsgi:app`)
```
wsgi.py: init_db() → start both threads → create_app() → handed to Gunicorn
```
`--workers 1` is intentional: SQLite does not support concurrent writers, and the daemon threads must share the same process.

---

## Ingestion Pipeline (`app/ingest.py`)

Runs forever in a daemon thread. One aircraft processed per cycle.

```
while True:
  1. GET https://api.adsb.lol/v2/closest/{lat}/{lon}/{radius}  (timeout=10s)
     → returns ac[0]: { hex, r(reg), flight(callsign), t(type), alt_baro, gs, dst, track }

  2. Aircraft enrichment  (registration-based)
     → check aircraft_cache first
     → if miss: GET https://api.adsbdb.com/v0/aircraft/{reg}  (timeout=8s)
       → returns: icao_type, type(model), manufacturer, registered_owner, country name+iso
     → upsert aircraft_cache

  3. Route enrichment  (callsign-based)
     → check callsign_cache first
     → if miss: GET https://api.adsbdb.com/v0/callsign/{callsign}  (timeout=8s)
       → returns: airline{name}, origin{iata_code,name}, destination{iata_code,name}
     → upsert callsign_cache

  4. log_flight(row)  → dedup + write to flights table
  5. sleep(POLL_SECONDS)
```

All exceptions are caught; the loop never exits on error.

---

## Event Deduplication (`db.py → log_flight()`)

```python
event_key = "{hex}|{reg}|{callsign}"

SELECT id, last_seen FROM flights WHERE event_key = ? ORDER BY last_seen DESC LIMIT 1

if no match:
    INSERT new row (times_seen=1)
elif gap >= EVENT_WINDOW_MINUTES:
    UPDATE: last_seen, seen_at, times_seen+1, telemetry fields,
            enrich fields (COALESCE — never overwrite with empty),
            classification
else:
    UPDATE: last_seen, seen_at, telemetry fields, classification only
```

---

## Classification Engine (`db.py → classify_flight()`)

Priority order (first match wins):

| Priority | Class | Signals |
|---|---|---|
| 1 | `government` | Owner contains: air force, navy, army, fbi, dhs, coast guard, military… **or** callsign starts with: RCH, SAM, AF, NAVY, ARMY, REACH, SPAR, EXEC… |
| 2 | `cargo` | airline_name contains: fedex, ups, dhl, amazon air, atlas air… **or** owner contains: cargo, freight, logistics **or** type_code in cargo conversion set (B763, B744, MD11…) |
| 3 | `commercial` | airline_name present (and not cargo) **or** owner contains: airlines, airways |
| 4 | `private` | Owner contains charter operators (NetJets, Flexjet, VistaJet…) **or** LLC/Inc/Trust + has type_code **or** type_code in biz-jet set (GLF*, C25*, LJ*, FA*, CL3*…) **or** small GA type (C172, SR22, PA28…) |
| 5 | `unknown` | No match |

### Background Classifier (`app/classifier.py`)

Runs every 30 seconds. Fetches up to 250 rows where `classification IS NULL OR = '' OR = 'unknown'`, re-runs `classify_flight()`, and updates only rows that resolve to something other than `unknown`.

---

## API Endpoints (`app/api.py`)

All routes are under the `api_bp` Blueprint. All return JSON.

### Flight Data

| Method | Path | Params | Returns |
|---|---|---|---|
| GET | `/api/flights` | `limit=100` (max 1000), `offset=0` | Array of flight objects, ordered by `last_seen DESC` |
| GET | `/api/flights/search-by-time` | `datetime=YYYY-MM-DDTHH:MM:SS` | Up to 10 flights nearest to that timestamp (within 7 days) |

### Statistics

| Method | Path | Returns |
|---|---|---|
| GET | `/api/stats/summary` | `{total_events, unique_aircraft, operators, countries, avg_altitude}` |
| GET | `/api/stats/summary-24h` | `{events_24h, aircraft_24h, operators_24h}` |
| GET | `/api/stats/classification` | `[{classification, count}]` |
| GET | `/api/stats/classification-detailed` | `[{classification, total_count, unique_aircraft, avg_altitude, count_24h}]` |
| GET | `/api/stats/top-aircraft` | Top 10 by `times_seen` |
| GET | `/api/stats/top-operators` | Top 10 airlines/owners by event count, includes derived `icao_code` |
| GET | `/api/stats/countries` | All countries with `aircraft_count` + `event_count` |
| GET | `/api/stats/routes` | Top 10 routes (min 2 events), joined with airport coords |
| GET | `/api/stats/routes-map` | `range=all\|week` — top 12 routes with coords + `classifications` concat for color coding |
| GET | `/api/stats/hourly` | `[{hour, events}]` for last 24h, grouped by local hour |
| GET | `/api/stats/activity-by-day` | `[{day_name, day_num, events}]` last 7 days |
| GET | `/api/stats/altitude-distribution` | `[{altitude_band, count}]` — bands: ground / low / medium / high |
| GET | `/api/stats/aircraft-types` | Top 15 type codes with model, manufacturer, event+unique counts |
| GET | `/api/stats/recent-notable` | Last 20 government/cargo flights or `times_seen >= 5` |

### Admin

| Method | Path | Params | Returns |
|---|---|---|---|
| GET | `/api/admin/classification-stats` | — | `{total, null_count, empty_count, unknown_count, invalid_count}` |
| POST | `/api/admin/backfill-classification` | `force=true`, `limit=N` | `{updated, changed, forced}` — re-runs classifier on existing rows |

---

## Flight Object Shape

```json
{
  "id": 42,
  "seen_at": "2024-03-22T12:34:56",
  "hex": "a1b2c3",
  "reg": "N12345",
  "callsign": "UAL123",
  "type_code": "B787",
  "model": "Boeing 787-9",
  "manufacturer": "Boeing",
  "owner": "United Airlines",
  "airline_name": "United Airlines",
  "country": "United States",
  "country_iso": "US",
  "origin_iata": "ORD",
  "origin_name": "Chicago O'Hare",
  "dest_iata": "LAX",
  "dest_name": "Los Angeles International",
  "altitude_ft": 35000,
  "ground_speed_kt": 495,
  "distance_nm": 42.3,
  "heading_deg": 285,
  "event_key": "a1b2c3|N12345|UAL123",
  "first_seen": "2024-03-22T12:00:00",
  "last_seen": "2024-03-22T12:34:56",
  "times_seen": 5,
  "classification": "commercial"
}
```

---

## External Services

| Service | URL | Used for | Cached? |
|---|---|---|---|
| adsb.lol | `https://api.adsb.lol/v2/closest/{lat}/{lon}/{radius}` | Real-time ADS-B data | No (live) |
| adsbdb.com | `https://api.adsbdb.com/v0/aircraft/{reg}` | Registry lookup | Yes — `aircraft_cache` |
| adsbdb.com | `https://api.adsbdb.com/v0/callsign/{callsign}` | Route/airline lookup | Yes — `callsign_cache` |
| OpenFlights | GitHub raw CSV | Airport reference data | Yes — `airports` table |
| Planespotters.net | `https://api.planespotters.net/pub/photos/reg/{reg}` | Aircraft photos | React in-memory state |

---

## Middleware & Routing

- **CORS**: `flask_cors.CORS(app)` — allows frontend dev server (`:5173`) to call API (`:8080`)
- **SPA fallback**: In production, any non-API path serves `frontend/dist/index.html`
- **Vite proxy** (dev): `/api/*` → `http://localhost:8080`
- **No authentication** — local-use only, all endpoints public

---

## Thread Model

```
Process
├── Main thread       — Flask/Gunicorn handles HTTP requests
├── ingestion-thread  — polls ADS-B + enriches + writes to DB every 12s
└── classifier-thread — re-classifies unclassified rows every 30s
```

SQLite serializes writes natively. No mutexes or queues needed. `--workers 1` on Gunicorn is required to keep threads co-located with the DB connection.

---

## Error Handling

- Ingestion loop: bare `except Exception` → print + continue, never exits
- Enrichment functions: `try/except` → return `None`, caller skips enrichment gracefully
- Classifier loop: bare `except Exception` → print + continue
- API routes: no explicit error handling; Flask returns 500 on unhandled exceptions
- Frontend: `.catch(console.error)` on all fetches; UI shows stale data on failure
