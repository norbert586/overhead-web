#!/usr/bin/env node
// Full-stack end-to-end check in a real (headless) mobile browser — no
// network needed. Starts the mock upstreams (feed, adsbdb and the photo
// providers), a backend on a throwaway database, and the Vite dev server;
// drives the app through aircraft photos and the failure modes that matter;
// tears everything down. ~3 minutes (the outage scenario waits out the real
// 45 s stale windows).
//
//   node scripts/e2e.mjs              # from the repo root, deps installed in backend/ + frontend/
//   E2E_SHOTS=/tmp/shots node scripts/e2e.mjs   # keep screenshots somewhere specific
//
// Needs Playwright + Chromium. Claude Code cloud sessions have both
// preinstalled (global `playwright`, browsers in /opt/pw-browsers).
// Elsewhere: `npm i -g playwright && npx playwright install chromium`.

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTS = { mock: 4655, api: 3911, web: 5191 };
const ADMIN = 'e2e-admin@example.com';
const PASSWORD = 'e2e-password-1';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'overhead-e2e-'));
const SHOTS = process.env.E2E_SHOTS ?? TMP;
fs.mkdirSync(SHOTS, { recursive: true });

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const base of [path.join(ROOT, 'frontend'), ROOT]) {
    try { return createRequire(path.join(base, 'package.json'))('playwright'); } catch { /* next */ }
  }
  try {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  } catch {
    console.error('Playwright not found. Install it: npm i -g playwright && npx playwright install chromium');
    process.exit(2);
  }
}

const children = [];
function start(name, cmd, args, cwd, env = {}) {
  const log = fs.openSync(path.join(TMP, `${name}.log`), 'a');
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', log, log] });
  children.push(child);
  return child;
}

async function waitFor(url, label, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${label} did not come up at ${url} — see ${TMP}/${label}.log`);
}

const backendEnv = {
  PORT: String(PORTS.api),
  JWT_SECRET: 'e2e-secret',
  INVITE_CODE: 'e2e',
  ADMIN_EMAILS: ADMIN,
  DIAGNOSTICS_KEY: 'e2e-diagnostics-key-0123456789',
  DB_PATH: path.join(TMP, 'e2e.db'),
  ADSB_BASE_URL: `http://localhost:${PORTS.mock}/v2/point`,
  ADSBDB_BASE_URL: `http://localhost:${PORTS.mock}/v0`,
  PLANESPOTTERS_BASE_URL: `http://localhost:${PORTS.mock}/planespotters/pub/photos`,
  AIRPORT_DATA_BASE_URL: `http://localhost:${PORTS.mock}/airport-data/api`,
  WIKIPEDIA_API_URL: `http://localhost:${PORTS.mock}/wikipedia/w/api.php`,
  NODE_ENV: 'production',
  LOG_LEVEL: 'warn',
};
let backend;
async function startBackend() {
  backend = start('backend', process.execPath, ['--import', 'tsx', 'src/index.ts'], path.join(ROOT, 'backend'), backendEnv);
  await waitFor(`http://localhost:${PORTS.api}/api/health`, 'backend');
}

const mode = (m) => fetch(`http://localhost:${PORTS.mock}/__mode?mode=${m}`);
let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures += 1; };

async function main() {
  console.log(`e2e: logs + screenshots in ${SHOTS === TMP ? TMP : `${TMP} (logs), ${SHOTS} (shots)`}\n`);
  start('mock', process.execPath, ['backend/scripts/mock-adsb.mjs'], ROOT, { PORT: String(PORTS.mock) });
  await waitFor(`http://localhost:${PORTS.mock}/__status`, 'mock');
  await startBackend();
  start('vite', process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORTS.web), '--strictPort'],
    path.join(ROOT, 'frontend'), { VITE_API_URL: `http://localhost:${PORTS.api}` });
  await waitFor(`http://localhost:${PORTS.web}/`, 'vite');

  // Register the admin user, then restart so ADMIN_EMAILS promotes it
  // (the allowlist syncs at startup) — also exercises graceful shutdown.
  const reg = await fetch(`http://localhost:${PORTS.api}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN, password: PASSWORD, inviteCode: 'e2e' }),
  }).then((r) => r.json());
  backend.kill('SIGINT');
  await new Promise((r) => backend.once('exit', r));
  await startBackend();
  const login = await fetch(`http://localhost:${PORTS.api}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN, password: PASSWORD }),
  }).then((r) => r.json());
  check(!!reg.token && login.user?.isAdmin === true, 'registered admin user (restart promoted it)');

  const { chromium, devices } = loadPlaywright();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    geolocation: { latitude: 40.69, longitude: -74.17 },
    permissions: ['geolocation'],
  });
  // The browser's own Planespotters fallback must not reach the internet.
  await ctx.route('https://api.planespotters.net/**', (r) => r.abort());
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const status = () => page.locator('.top-bar .scan-text').first().innerText().catch(() => '?');
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const app = `http://localhost:${PORTS.web}/`;

  try {
    console.log('healthy feed');
    await mode('ok');
    await page.goto(app);
    await page.evaluate(([t, u]) => {
      localStorage.setItem('overhead_token', t);
      localStorage.setItem('overhead_user', JSON.stringify(u));
    }, [login.token, login.user]);
    const t0 = Date.now();
    await page.reload();
    await page.locator('.overhead-nearby-row').first().waitFor({ timeout: 15_000 });
    check(true, `first aircraft painted in ${Date.now() - t0} ms; status "${await status()}"`);
    check((await page.locator('.overhead-nearby-row').count()) === 3, 'three nearest aircraft listed');
    await shot('1-healthy');

    console.log('aircraft photos');
    const hero = page.locator('.aircraft-photo-wrap');
    const heroPhoto = async () => {
      await hero.locator('.smart-photo-img.loaded, .photo-silhouette.not-found').first().waitFor({ timeout: 15_000 });
      return hero.evaluate((el) => ({
        provider: el.querySelector('.smart-photo')?.getAttribute('data-provider') ?? null,
        credit: el.querySelector('.photo-credit')?.textContent ?? null,
        creditHref: el.querySelector('a.photo-credit')?.getAttribute('href') ?? null,
        photoHref: el.querySelector('.smart-photo-link')?.getAttribute('href') ?? null,
        label: el.querySelector('.photo-match-label')?.textContent ?? null,
        notFound: !!el.querySelector('.photo-silhouette.not-found'),
        searchHref: el.querySelector('.photo-silhouette-search')?.getAttribute('href') ?? null,
      }));
    };
    let p = await heroPhoto();
    check(p.provider === 'planespotters' && /Mock Spotter/.test(p.credit ?? '') && !p.label,
      `exact Planespotters photo with photographer credit ("${p.credit}")`);
    check(p.photoHref === p.creditHref && /planespotters\.net\/photo\//.test(p.photoHref ?? ''),
      'photo and credit link to the Planespotters photo page');
    // Framing: the aircraft (the server's focus box) must be inside the visible frame.
    const api = `http://localhost:${PORTS.api}`;
    const photos = await fetch(`${api}/api/photos?hex=a00000&reg=N100T&type=B738&callsign=TST100`).then((r) => r.json());
    const focus = photos.candidates[0]?.focus;
    const framing = await hero.evaluate((el, f) => {
      const box = el.getBoundingClientRect();
      const img = el.querySelector('.smart-photo-img').getBoundingClientRect();
      const plane = { l: img.left + f.x * img.width, t: img.top + f.y * img.height, r: img.left + (f.x + f.w) * img.width, b: img.top + (f.y + f.h) * img.height };
      return { inside: plane.l >= box.left - 1 && plane.r <= box.right + 1 && plane.t >= box.top - 1 && plane.b <= box.bottom + 1, fill: (plane.r - plane.l) / box.width };
    }, focus);
    check(!!focus && framing.inside, `aircraft fully inside the frame (fills ${Math.round(framing.fill * 100)}% of the width)`);
    await page.locator('.overhead-nearby-row').nth(1).click();
    p = await heroPhoto();
    check(p.provider === 'airport-data' && /Mock Photographer/.test(p.credit ?? ''), `Airport-Data photo when Planespotters has none ("${p.credit}")`);
    await page.locator('.overhead-nearby-row').nth(2).click();
    p = await heroPhoto();
    check(p.provider === 'wikimedia' && /reference photo/i.test(p.label ?? '') && /CC BY-SA/.test(p.credit ?? ''),
      `no airframe photo → labelled, licensed reference photo ("${p.label}")`);
    await shot('1b-reference-photo');
    await page.locator('.overhead-nearby-row').nth(0).click();

    // A dead image URL falls through to the next candidate; an aircraft with
    // nothing anywhere gets the plain "no photo" state with a manual lookup.
    const ctx2 = await browser.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 40.69, longitude: -74.17 }, permissions: ['geolocation'] });
    await ctx2.route('https://api.planespotters.net/**', (r) => r.abort());
    await ctx2.route('**/img/ps-runway.jpg', (r) => r.fulfill({ status: 404, body: 'gone' }));
    await ctx2.route((u) => u.pathname === '/api/photos' && u.searchParams.get('hex') === 'a00001',
      (r) => r.fulfill({ json: { candidates: [], complete: true } }));
    const page2 = await ctx2.newPage();
    await page2.goto(app);
    await page2.evaluate(([t, u]) => {
      localStorage.setItem('overhead_token', t);
      localStorage.setItem('overhead_user', JSON.stringify(u));
    }, [login.token, login.user]);
    await page2.reload();
    const hero2 = page2.locator('.aircraft-photo-wrap');
    await hero2.locator('.smart-photo-img.loaded').waitFor({ timeout: 15_000 });
    check(await hero2.locator('.smart-photo').getAttribute('data-provider') === 'wikimedia', 'broken photo URL → next candidate shown');
    await page2.locator('.overhead-nearby-row').nth(1).click();
    await hero2.locator('.photo-silhouette.not-found').waitFor({ timeout: 10_000 });
    const search = await hero2.locator('.photo-silhouette-search').getAttribute('href');
    check(/planespotters\.net\/photos\/reg\/N101T/.test(search ?? ''), `nothing anywhere → "No photo found" + manual search link`);
    await page2.screenshot({ path: path.join(SHOTS, '1c-no-photo.png') });
    await ctx2.close();

    console.log('diagnostics panel');
    // Phones hide the bottom bar, so open it the way a phone user would.
    await page.locator('.hamburger').click();
    const menuVersion = await page.locator('.menu-version').innerText();
    check(/overhead v\d+\.\d+\.\d+ · \w+/i.test(menuVersion), `menu shows the release and build ("${menuVersion}")`);
    await page.locator('.menu-item', { hasText: 'Diagnostics' }).click();
    await page.locator('.diag-panel .diag-row').first().waitFor({ timeout: 10_000 });
    const panelText = await page.locator('.diag-panel').innerText();
    check(/Server build/i.test(panelText) && /Last poll/i.test(panelText), 'panel shows builds + last poll');
    check(/ok .* ms/i.test(panelText), 'panel reports last poll ok');
    await shot('2-diagnostics-panel');
    await page.getByRole('button', { name: 'Close' }).click();

    console.log('feeds down');
    await mode('down');
    await page.locator('.overhead-stale-note').waitFor({ timeout: 30_000 });
    check(true, `stale note "${await page.locator('.overhead-stale-note').innerText()}"; status "${await status()}"`);
    await page.locator('.empty-title-error').waitFor({ timeout: 120_000 });
    const title = await page.locator('.empty-title-error').innerText();
    check(/feeds not answering/i.test(title), `error state "${title}"`);
    const ref = await page.locator('.empty-retry-ref').innerText();
    check(/ref [0-9a-f]{8}/i.test(ref), `error screen quotes request id ("${ref}")`);
    await shot('3-feeds-down');

    console.log('recovery');
    await mode('ok');
    await page.locator('.empty-error-retry').click();
    await page.locator('.overhead-nearby-row').first().waitFor({ timeout: 10_000 });
    check(true, `Retry now recovered; status "${await status()}"`);

    console.log('admin → system');
    await page.locator('.hamburger').click();
    await page.locator('.menu-item', { hasText: 'Admin' }).click();
    await page.getByRole('button', { name: 'System' }).click();
    await page.locator('.diag-admin-problems').waitFor({ timeout: 10_000 });
    const sys = await page.locator('.admin-screen').innerText();
    check(/upstream_unavailable/.test(sys), 'System tab shows the upstream_unavailable polls');
    check(/poll-upstream/.test(sys), 'System tab shows the client error report');
    await page.getByRole('button', { name: 'Run live probe' }).click();
    await page.getByText('reachable').first().waitFor({ timeout: 20_000 });
    check(true, 'live probe ran');
    await shot('4-admin-system');

    console.log('offline');
    await page.locator('.hamburger').click();
    await page.locator('.menu-item', { hasText: 'Flight' }).click();
    await ctx.setOffline(true);
    await page.locator('.empty-title-error').waitFor({ timeout: 90_000 });
    check(/no connection/i.test(await page.locator('.empty-title-error').innerText()), 'offline → "No connection"');
    await ctx.setOffline(false);
    await page.locator('.overhead-nearby-row').first().waitFor({ timeout: 15_000 });
    check(true, 'back online → recovered');

    console.log('rejected session');
    await page.evaluate(() => localStorage.setItem('overhead_token', 'not.a.valid-token'));
    await page.reload();
    await page.locator('.auth-notice').waitFor({ timeout: 15_000 });
    check(true, `bad token → sign-in with notice "${await page.locator('.auth-notice').innerText()}"`);
    await shot('5-session-expired');

    console.log('server-side diagnostics');
    const diag = await fetch(`http://localhost:${PORTS.api}/api/diagnostics`, {
      headers: { 'X-Diagnostics-Key': backendEnv.DIAGNOSTICS_KEY },
    }).then((r) => r.json());
    check(diag.metrics.last60min.errorCodes.auth_invalid >= 1, 'diagnostics counted the rejected session');
    check(diag.recent.clientReports.some((r) => r.kind === 'auth-expired'), 'client reported the session expiry');

    check(pageErrors.length === 0, `no uncaught page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
  } catch (err) {
    failures += 1;
    console.log(`  ✗ ${err.message}`);
    await shot('failure').catch(() => {});
  } finally {
    await browser.close();
  }

  console.log(`\n${failures ? `${failures} check(s) FAILED` : 'All e2e checks passed'} — screenshots in ${SHOTS}`);
  return failures;
}

main()
  .then((f) => { process.exitCode = f ? 1 : 0; })
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => { for (const c of children) c.kill('SIGINT'); });
