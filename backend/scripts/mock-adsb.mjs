#!/usr/bin/env node
// Mock upstreams for local development and tests — no network needed.
//
// Serves a readsb-style ADS-B feed (the adsb.lol / adsb.fi / airplanes.live
// shape) AND the adsbdb lookups, so the whole poll pipeline runs offline:
//
//   npm run mock-feed                       # listens on :4555 (PORT to change)
//   ADSB_BASE_URL=http://localhost:4555/v2/point \
//   ADSBDB_BASE_URL=http://localhost:4555/v0 npm run dev
//
// Behaviour can be flipped at runtime to reproduce outages:
//   curl localhost:4555/__mode?mode=ok      # 6 aircraft around the query point
//   curl localhost:4555/__mode?mode=empty   # empty sky
//   curl localhost:4555/__mode?mode=slow    # answers after 7 s (past the 4 s timeout)
//   curl localhost:4555/__mode?mode=down    # HTTP 503
//   curl localhost:4555/__mode?mode=garbage # 200 with a non-feed body
//   curl localhost:4555/__status            # mode + request counts
//
// /v2/closest returns only the nearest aircraft (as the real adsb.lol does)
// so the old single-aircraft bug stays reproducible.

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4555);
let mode = process.env.MODE ?? 'ok';
const hits = { feed: 0, adsbdb: 0 };

const OPERATORS = ['United Airlines', 'Delta Air Lines', 'FedEx', 'NetJets', 'United States Air Force', 'JetBlue'];
const TYPES = ['B738', 'A321', 'B763', 'C68A', 'C17', 'A320'];

function aircraft(lat, lon, n) {
  return Array.from({ length: n }, (_, i) => ({
    hex: `a${String(i).padStart(5, '0')}`,
    flight: `TST${100 + i}  `,
    r: `N${100 + i}T`,
    t: TYPES[i % TYPES.length],
    alt_baro: 3000 + i * 4000,
    gs: 180 + i * 40,
    track: (i * 60) % 360,
    baro_rate: i % 2 ? -800 : 1200,
    squawk: '1200',
    category: 'A3',
    lat: lat + i * 0.02,
    lon: lon + i * 0.02,
  }));
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://mock');
  const parts = url.pathname.split('/').filter(Boolean);

  if (url.pathname === '/__mode') {
    mode = url.searchParams.get('mode') ?? 'ok';
    hits.feed = 0;
    hits.adsbdb = 0;
    return json(res, 200, { mode });
  }
  if (url.pathname === '/__status') return json(res, 200, { mode, hits });

  // adsbdb: /v0/aircraft/:reg and /v0/callsign/:callsign
  if (parts[0] === 'v0') {
    hits.adsbdb += 1;
    const i = Number((parts[2] ?? '').replace(/\D/g, '')) % OPERATORS.length || 0;
    if (parts[1] === 'aircraft') {
      return json(res, 200, { response: { aircraft: {
        type: TYPES[i], manufacturer: 'Mockwell', registered_owner: OPERATORS[i],
        registered_owner_country_name: 'United States', registered_owner_country_iso_name: 'US', url_photo: null,
      } } });
    }
    if (parts[1] === 'callsign') {
      return json(res, 200, { response: { flightroute: {
        airline: { name: OPERATORS[i] },
        origin: { iata_code: 'EWR', municipality: 'Newark', country_iso_name: 'US' },
        destination: { iata_code: 'DEN', municipality: 'Denver', country_iso_name: 'US' },
      } } });
    }
    return json(res, 404, { response: 'unknown' });
  }

  // Feed: /v2/<point|closest>/<lat>/<lon>/<r> and /api/v2/lat/<lat>/lon/<lon>/dist/<r>
  hits.feed += 1;
  const nums = parts.map(Number).filter((n) => Number.isFinite(n));
  const [lat, lon] = nums;
  const send = () => {
    if (mode === 'down') { res.writeHead(503); res.end('mock upstream down'); return; }
    if (mode === 'garbage') return json(res, 200, { message: 'API key required' });
    let ac = mode === 'empty' ? [] : aircraft(lat ?? 0, lon ?? 0, 6);
    if (parts.includes('closest')) ac = ac.slice(0, 1);
    json(res, 200, { ac, now: Date.now(), total: ac.length });
  };
  if (mode === 'slow') setTimeout(send, 7_000);
  else send();
}).listen(PORT, () => console.log(`mock upstreams on :${PORT} (mode=${mode})`));
