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
//
// It also stands in for the photo providers (point PLANESPOTTERS_BASE_URL,
// AIRPORT_DATA_BASE_URL and WIKIPEDIA_API_URL at /planespotters/pub/photos,
// /airport-data/api and /wikipedia/w/api.php) and serves drawn JPEGs:
//   aircraft 0 (N100T) — Planespotters thumbnail, aircraft low-left on a runway
//   aircraft 1 (N101T) — Airport-Data only, small aircraft high-right in the sky
//   aircraft 2+        — no airframe photo: Wikimedia reference photo of the type
//   curl localhost:4555/__photos?mode=ok|none|down|broken
//     none: nobody has a photo · down: photo APIs 503 ·
//     broken: airframe image URLs 404 (the Wikimedia one still loads)

import http from 'node:http';
import jpeg from 'jpeg-js';

const PORT = Number(process.env.PORT ?? 4555);
let mode = process.env.MODE ?? 'ok';
let photoMode = 'ok';
const hits = { feed: 0, adsbdb: 0, photos: 0, images: 0 };

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

// ── Drawn photos ────────────────────────────────────────────────────────────
// A side-view airliner (nose right) in a 1000×300 unit box, rasterised into
// RGBA so the server's framing analysis has a real JPEG to chew on.

function draw(w, h, scene) {
  const d = Buffer.alloc(w * h * 4);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const c = scene.sky[0].map((v, k) => Math.round(v + (scene.sky[1][k] - v) * t));
    for (let x = 0; x < w; x++) set(x, y, c);
  }
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, y1); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x++) set(x, y, c);
  };
  const ellipse = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, c);
  };
  const poly = (pts, c) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) set(x, y, c);
      }
  };
  if (scene.cloud) ellipse(w * 0.2, h * 0.18, w * 0.12, h * 0.04, [222, 234, 245]);
  if (scene.ground) {
    rect(0, scene.ground, w, h, [91, 122, 58]);
    rect(0, scene.ground + (h - scene.ground) * 0.45, w, scene.ground + (h - scene.ground) * 0.75, [85, 88, 92]);
    for (let x = 0; x < w; x += w / 28) ellipse(x, scene.ground, h * 0.03, h * 0.03, [61, 90, 42]);
  }
  const { x: ox, y: oy, s } = scene.plane;
  const P = (x, y) => [ox + x * s, oy + y * s];
  const white = [244, 246, 248], livery = [29, 79, 145], grey = [170, 176, 184], dark = [43, 52, 64];
  poly([P(40, 160), P(10, 40), P(70, 40), P(150, 132), P(60, 150)], livery);
  rect(...P(60, 132), ...P(900, 196), white);
  ellipse(...P(900, 164), 75 * s, 32 * s, white);
  ellipse(...P(60, 164), 30 * s, 32 * s, white);
  rect(...P(70, 182), ...P(930, 196), livery);
  poly([P(380, 178), P(560, 178), P(470, 250), P(430, 250)], grey);
  rect(...P(455, 200), ...P(565, 234), [140, 146, 154]);
  for (let i = 0; i < 34; i++) rect(...P(160 + i * 20, 146), ...P(169 + i * 20, 157), dark);
  rect(...P(200, 196), ...P(208, 236), dark); ellipse(...P(204, 244), 12 * s, 12 * s, [25, 25, 25]);
  rect(...P(820, 196), ...P(828, 236), dark); ellipse(...P(824, 244), 12 * s, 12 * s, [25, 25, 25]);
  return jpeg.encode({ data: d, width: w, height: h }, 85).data;
}

const IMAGES = {
  // Planespotters' thumbnail_large size, aircraft low and left of centre.
  'ps-runway.jpg': draw(420, 280, { sky: [[169, 196, 220], [232, 238, 242]], ground: 196, plane: { x: 6, y: 118, s: 0.27 }, cloud: true }),
  // Small aircraft high and right in a wide sky.
  'ad-sky.jpg': draw(640, 427, { sky: [[63, 127, 196], [169, 205, 240]], plane: { x: 360, y: 40, s: 0.24 }, cloud: true }),
  // Commons-sized reference photo, centred.
  'wiki-type.jpg': draw(1280, 853, { sky: [[127, 178, 229], [214, 232, 247]], ground: 640, plane: { x: 140, y: 330, s: 1 } }),
};

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
  if (url.pathname === '/__status') return json(res, 200, { mode, photoMode, hits });
  if (url.pathname === '/__photos') {
    photoMode = url.searchParams.get('mode') ?? 'ok';
    hits.photos = 0;
    hits.images = 0;
    return json(res, 200, { photoMode });
  }

  const base = `http://${req.headers.host}`;
  // Which mock aircraft is this? N10<i>T / a0000<i>.
  const which = (id) => Number((String(id ?? '').match(/(\d)\D*$/) ?? [])[1] ?? -1);

  if (parts[0] === 'img') {
    hits.images += 1;
    const img = IMAGES[parts[1]];
    // broken: the airframe photos have been taken down; the reference photo hasn't.
    if (!img || (photoMode === 'broken' && !parts[1].startsWith('wiki'))) { res.writeHead(404); res.end('gone'); return; }
    res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': img.length });
    res.end(img);
    return;
  }

  if (parts[0] === 'planespotters' || parts[0] === 'airport-data' || parts[0] === 'wikipedia') {
    hits.photos += 1;
    if (photoMode === 'down') return json(res, 503, { error: 'mock photo provider down' });
    const none = photoMode === 'none';

    // /planespotters/pub/photos/<reg|hex>/<id>
    if (parts[0] === 'planespotters') {
      if (none || which(parts[4]) !== 0) return json(res, 200, { photos: [] });
      return json(res, 200, { photos: [{
        id: '1000001',
        thumbnail: { src: `${base}/img/ps-runway.jpg`, size: { width: 200, height: 133 } },
        thumbnail_large: { src: `${base}/img/ps-runway.jpg`, size: { width: 420, height: 280 } },
        link: 'https://www.planespotters.net/photo/1000001/n100t-mock-air',
        photographer: 'Mock Spotter',
      }] });
    }

    // /airport-data/api/ac_thumb.json?m=<hex>&r=<reg>
    if (parts[0] === 'airport-data') {
      if (none || which(url.searchParams.get('m')) !== 1) return json(res, 200, { status: 404, error: 'Aircraft not found' });
      return json(res, 200, { status: 200, count: 1, data: [{
        image: `${base}/img/ad-sky.jpg`,
        link: 'https://www.airport-data.com/aircraft/photo/001000002.html',
        photographer: 'Mock Photographer',
      }] });
    }

    // /wikipedia/w/api.php?action=query&titles=…
    const titles = url.searchParams.get('titles') ?? url.searchParams.get('gsrsearch') ?? '';
    if (titles.startsWith('File:')) {
      return json(res, 200, { query: { pages: [{
        title: titles, imagerepository: 'shared',
        imageinfo: [{
          url: `${base}/img/wiki-type.jpg`, width: 1280, height: 853, mime: 'image/jpeg',
          thumburl: `${base}/img/wiki-type.jpg`, thumbwidth: 1280, thumbheight: 853,
          descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(titles)}`,
          extmetadata: {
            Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Mock">Mock &amp; Commons</a>' },
            LicenseShortName: { value: 'CC BY-SA 4.0' },
          },
        }],
      }] } });
    }
    if (none || !titles) return json(res, 200, { query: { pages: [{ title: titles, missing: true }] } });
    return json(res, 200, { query: { pages: [{
      title: titles, index: 1, description: 'Wide-body airliner family',
      pageimage: `Mock_${titles.replace(/\W+/g, '_')}.jpg`,
    }] } });
  }

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
