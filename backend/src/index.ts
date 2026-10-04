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
import flightsRouter from './routes/flights';
import statsRouter from './routes/stats';
import authRouter from './routes/auth';
import userRouter from './routes/user';
import adminRouter from './routes/admin';

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
  app.use(cors());
  app.use(express.json());
  app.use(httpLogger);

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

  // /api/log proxies to the log route on the flights router
  app.get('/api/log', (req, res, next) => {
    req.url = '/log';
    flightsRouter(req, res, next);
  });

  // Includes per-provider ADS-B feed health and the adsbdb breaker so an
  // upstream outage can be diagnosed in production with a single curl.
  // nginx only forwards /api/* to Express, so /api/health is the public
  // address; /health stays for on-box checks.
  const health = (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      adsb: getAdsbStatus(),
      enrichment: getEnrichmentStatus(),
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
