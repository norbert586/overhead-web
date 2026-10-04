import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { initDb } from './database/db';
import { runMigrations } from './database/migrations';
import { pruneFlightTrack } from './database/queries';
import { swaggerSpec } from './swagger';
import { logger, httpLogger } from './logger';
import { isEmailConfigured } from './services/email';
import { getAdsbStatus } from './services/adsb';
import { getEnrichmentStatus } from './services/enrichment';
import { metricsMiddleware, recentPollOutcomes } from './services/diagnostics';
import { VERSION } from './version';
import flightsRouter from './routes/flights';
import statsRouter from './routes/stats';
import authRouter from './routes/auth';
import userRouter from './routes/user';
import adminRouter from './routes/admin';
import diagnosticsRouter from './routes/diagnostics';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function start() {
  await initDb();
  runMigrations();

  // Keep the position-track table bounded: prune at startup and every 6 hours.
  try { pruneFlightTrack(); } catch (err) { logger.error({ err }, 'track prune failed'); }
  setInterval(() => {
    try { pruneFlightTrack(); } catch (err) { logger.error({ err }, 'track prune failed'); }
  }, 6 * 60 * 60 * 1000).unref();

  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET is not set — sessions are signed with a public default and can be forged. Set it in backend/.env.');
  }

  const app = express();
  // X-Request-Id must be readable cross-origin (dev runs the API on its own
  // port) so error screens and client reports can quote it.
  app.use(cors({ exposedHeaders: ['X-Request-Id'] }));
  app.use(express.json());
  app.use(httpLogger);
  app.use(metricsMiddleware);

  // Live data must never be served from a browser, proxy, or CDN cache.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  app.use('/api/auth', authRouter);
  app.use('/api/user', userRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/flights', flightsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/diagnostics', diagnosticsRouter);

  // /api/log proxies to the log route on the flights router
  app.get('/api/log', (req, res, next) => {
    req.url = '/log';
    flightsRouter(req, res, next);
  });

  // Public, cheap, safe to poll from an uptime monitor. Always HTTP 200 while
  // the process is up (the deploy health check relies on that). `status` is
  // 'degraded' only when users are affected, with `problems` saying why in
  // plain words; `warnings` are worth fixing but not user-visible (a backup
  // feed down while the primary works). nginx only forwards /api/* to
  // Express, so /api/health is the public address; /health stays for
  // on-box checks. Deeper detail: GET /api/diagnostics (admin or key).
  const health = (_req: express.Request, res: express.Response) => {
    const adsb = getAdsbStatus();
    const enrichment = getEnrichmentStatus();
    const polls = recentPollOutcomes(5);
    const problems: string[] = [];
    const warnings: string[] = [];
    const recentMs = 5 * 60_000;
    const failingNow = adsb.providers.filter((p) =>
      p.lastErrorAt && Date.now() - Date.parse(p.lastErrorAt) < recentMs &&
      (!p.lastSuccessAt || Date.parse(p.lastErrorAt) > Date.parse(p.lastSuccessAt)));
    if (failingNow.length === adsb.providers.length) problems.push('every ADS-B provider is failing');
    else if (failingNow.length) warnings.push(`failing ADS-B providers: ${failingNow.map((p) => p.name).join(', ')}`);
    if (polls.upstream_unavailable) problems.push(`${polls.upstream_unavailable} poll(s) got no flight data in the last 5 min`);
    if (enrichment.breakerOpen) problems.push('adsbdb lookups paused (circuit breaker open)');
    if (!process.env.JWT_SECRET) warnings.push('JWT_SECRET not set — sessions can be forged');
    res.json({
      status: problems.length ? 'degraded' : 'ok',
      problems,
      warnings,
      version: VERSION,
      uptimeSec: Math.round(process.uptime()),
      pollsLast5Min: polls,
      adsb,
      enrichment,
    });
  };
  app.get('/health', health);
  app.get('/api/health', health);

  // Global error handler — must be registered last, after all routes. Catches
  // anything a handler throws or passes to next(err) and turns it into a clean
  // 500 instead of letting it bubble toward the process. Express recognises
  // this as an error handler only because it declares four parameters, so
  // `_next` must stay even though it is unused.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'unhandled request error');
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  if (!isEmailConfigured()) {
    logger.warn(
      'Email not configured — welcome, password-reset, and verification emails will be logged but not delivered. Set RESEND_API_KEY or SMTP_HOST in .env.',
    );
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT, docs: `/api/docs` }, `Overhead backend running on http://0.0.0.0:${PORT}`);
  });

  // Node closes idle keep-alive sockets after 5 s by default. If nginx (or
  // any proxy) reuses a socket just as Node closes it, that request fails
  // with a 502. Outlive the proxy's idle timeout instead.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // pm2 restart (every deploy) sends SIGINT. Stop accepting connections and
  // let in-flight polls finish instead of cutting them off mid-response.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

// Last-resort process guards. Before these, a single stray rejected promise or
// uncaught throw would crash the server and 502 everyone at once.
process.on('unhandledRejection', (reason) => {
  // A floating rejected promise rarely corrupts global state, so log and keep
  // serving rather than taking everyone down over one bad async path.
  logger.error({ err: reason }, 'unhandledRejection (kept alive)');
});

process.on('uncaughtException', (err) => {
  // After an uncaught exception the process state is unknown, so exit and let
  // the supervisor restart cleanly. This REQUIRES a process manager (pm2 /
  // systemd / Docker --restart) to bring it back; without one the app stays
  // down until restarted manually.
  logger.error({ err }, 'uncaughtException — exiting for a clean restart');
  process.exit(1);
});

start().catch((err) => {
  logger.error({ err }, 'Failed to start');
  process.exit(1);
});
