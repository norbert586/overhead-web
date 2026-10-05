#!/usr/bin/env node
// Smoke test / quick diagnosis for a running backend.
//
//   npm run smoke                                         # local, :3001
//   BASE=https://overheadflight.com npm run smoke         # production, read-only
//   BASE=https://overheadflight.com DIAGNOSTICS_KEY=… npm run smoke
//                                                         # + full diagnostics & live probe
//
// Against localhost it also exercises the write paths (registers a throwaway
// user — needs INVITE_CODE matching the server — polls, checks the session
// error codes). Against anything else it only reads. Exits 1 on any failure.

const BASE = (process.env.BASE ?? 'http://localhost:3001').replace(/\/$/, '');
const KEY = process.env.DIAGNOSTICS_KEY ?? '';
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || process.argv.includes('--allow-writes');
const LAT = Number(process.env.LAT ?? 40.69);
const LON = Number(process.env.LON ?? -74.17);
// PHOTO_REG / PHOTO_TYPE pick the airframe for the photo check (default D-AIMA / A388).

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { failures += 1; console.log(`  ✗ ${msg}`); };
const info = (msg) => console.log(`    ${msg}`);
const warn = (msg) => console.log(`  ⚠ ${msg}`);

async function call(path, init = {}) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { res, body, ms: Date.now() - started, reqId: res.headers.get('x-request-id') };
}

async function main() {
  console.log(`Smoke test → ${BASE} (${LOCAL ? 'local: read + write' : 'remote: read-only'})\n`);

  console.log('health');
  try {
    const { res, body, ms, reqId } = await call('/api/health');
    if (res.status !== 200 || typeof body !== 'object') {
      bad(`/api/health → HTTP ${res.status} in ${ms} ms: ${JSON.stringify(body).slice(0, 200)}`);
      info('Not JSON / not 200: the backend is down, or nginx is not forwarding /api/* to it.');
    } else {
      (body.status === 'ok' ? ok : bad)(`status=${body.status} in ${ms} ms · server build ${body.version?.commit} · up ${body.uptimeSec}s`);
      for (const p of body.problems ?? []) info(`problem: ${p}`);
      for (const w of body.warnings ?? []) warn(`warning: ${w}`);
      for (const p of body.adsb?.providers ?? []) {
        info(`${p.name.padEnd(15)} last ok ${p.lastSuccessAt ?? 'never'} · last error ${p.lastError ?? '—'}${p.coolingDown ? ' · COOLING' : ''}`);
      }
      info(`polls last 5 min: ${JSON.stringify(body.pollsLast5Min ?? {})}`);
      (reqId ? ok : bad)(`X-Request-Id header ${reqId ? `present (${reqId})` : 'missing'}`);
    }
  } catch (err) {
    bad(`/api/health unreachable: ${err.message}`);
  }

  if (KEY) {
    console.log('\ndiagnostics (X-Diagnostics-Key)');
    const headers = { 'X-Diagnostics-Key': KEY };
    try {
      const { res, body } = await call('/api/diagnostics', { headers });
      if (res.status !== 200) {
        bad(`/api/diagnostics → HTTP ${res.status} (key wrong, or DIAGNOSTICS_KEY unset/short on the server)`);
      } else {
        ok(`snapshot: build ${body.version.commit}, up ${body.process.uptimeSec}s, rss ${body.process.memoryMb.rss} MB, db ${body.database.sizeBytes} bytes`);
        info(`env: ${JSON.stringify(body.process.env)}`);
        info(`last 60 min poll outcomes: ${JSON.stringify(body.metrics.last60min.pollOutcomes)}`);
        info(`last 60 min error codes:   ${JSON.stringify(body.metrics.last60min.errorCodes)}`);
        info(`poll latency: ${JSON.stringify(body.metrics.pollLatencyMs)}`);
        for (const l of body.recent.logs.slice(0, 10)) {
          info(`[${l.level}] ×${l.count} ${l.module ?? '-'}: ${l.msg} ${JSON.stringify(l.detail)}`);
        }
        for (const r of body.recent.clientReports.slice(0, 10)) {
          info(`[client ${r.user} ${r.appVersion}] ${r.kind}: ${r.message}${r.requestId ? ` (ref ${r.requestId})` : ''}`);
        }
      }
      const probe = await call('/api/diagnostics/probe', { headers });
      if (probe.res.status === 200) {
        // One unreachable fallback is worth knowing, not a failure — the app
        // works while any provider answers. All of them down is.
        for (const p of probe.body.providers) (p.ok ? ok : warn)(`probe ${p.name}: ${p.ok ? `${p.aircraft} aircraft, ${p.ms} ms` : p.error}`);
        if (probe.body.allProvidersDown) bad('probe: NO ADS-B provider is reachable from the server');
        (probe.body.adsbdb.ok ? ok : bad)(`probe adsbdb: ${probe.body.adsbdb.ok ? `${probe.body.adsbdb.ms} ms` : probe.body.adsbdb.error}`);
        // Photos are decoration: a failing provider is a warning, not a failure.
        for (const p of probe.body.photos ?? []) (p.ok ? ok : warn)(`probe ${p.name} (photos): ${p.ok ? `${p.ms} ms` : p.error}`);
      } else {
        bad(`/api/diagnostics/probe → HTTP ${probe.res.status}`);
      }
    } catch (err) {
      bad(`diagnostics failed: ${err.message}`);
    }
  }

  console.log('\nguest poll');
  try {
    const { res, body, ms } = await call(`/api/flights?lat=${LAT}&lon=${LON}&radius=10&record=false`);
    if (res.status === 200) ok(`200 in ${ms} ms · ${body.flights.length} shown · ${body.stats.activeCount} in range${body.stale ? ' · STALE' : ''}`);
    else bad(`HTTP ${res.status} in ${ms} ms: ${JSON.stringify(body)}`);
  } catch (err) {
    bad(`guest poll failed: ${err.message}`);
  }

  console.log('\nphotos');
  try {
    // A well-photographed airframe (Lufthansa's first A380) unless told otherwise.
    const reg = process.env.PHOTO_REG ?? 'D-AIMA';
    const type = process.env.PHOTO_TYPE ?? 'A388';
    const { res, body, ms } = await call(`/api/photos?reg=${encodeURIComponent(reg)}&type=${encodeURIComponent(type)}`);
    if (res.status !== 200) {
      bad(`/api/photos → HTTP ${res.status}: ${JSON.stringify(body)}`);
    } else {
      const [first] = body.candidates ?? [];
      const summary = (body.candidates ?? []).map((c) => `${c.provider}/${c.match}${c.focus ? '/framed' : ''}`).join(', ') || 'none';
      (first ? ok : warn)(`${reg} (${type}) in ${ms} ms → ${summary}${body.complete ? '' : ' · INCOMPLETE (a provider could not be asked)'}`);
      if (first && first.match !== 'exact') warn(`no photo of ${reg} itself — showing a ${first.provider} stand-in`);
    }
  } catch (err) {
    bad(`photo lookup failed: ${err.message}`);
  }

  if (LOCAL) {
    console.log('\nsigned-in paths (local only)');
    const invite = process.env.INVITE_CODE;
    if (!invite) {
      info('INVITE_CODE not set — skipping register/record checks');
    } else {
      const email = `smoke-${Date.now()}@example.com`;
      const reg = await call('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'smoke-password-1', inviteCode: invite }),
      });
      if (reg.res.status !== 201) {
        bad(`register → HTTP ${reg.res.status}: ${JSON.stringify(reg.body)}`);
      } else {
        const auth = { Authorization: `Bearer ${reg.body.token}` };
        const poll = await call(`/api/flights?lat=${LAT}&lon=${LON}&radius=15`, { headers: auth });
        (poll.res.status === 200 ? ok : bad)(`recording poll → ${poll.res.status} · ${poll.body.flights?.length ?? 0} shown, timesSeen=[${(poll.body.flights ?? []).map((f) => f.timesSeen)}]`);
        const refresh = await call('/api/auth/refresh', { method: 'POST', headers: auth });
        (refresh.res.status === 200 && refresh.body.token ? ok : bad)(`session refresh → ${refresh.res.status}`);
      }
    }
    const bogus = await call(`/api/flights?lat=${LAT}&lon=${LON}&radius=15`, { headers: { Authorization: 'Bearer not.a.token' } });
    (bogus.res.status === 401 && bogus.body.code === 'auth_invalid' ? ok : bad)(`bad token → ${bogus.res.status} ${bogus.body.code}`);
    const report = await call('/api/diagnostics/client-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'smoke-test', message: 'smoke test report', appVersion: 'smoke' }),
    });
    (report.res.status === 204 ? ok : bad)(`client report → ${report.res.status}`);
  }

  console.log(`\n${failures ? `${failures} check(s) FAILED` : 'All checks passed'}`);
  process.exit(failures ? 1 : 0);
}

main();
