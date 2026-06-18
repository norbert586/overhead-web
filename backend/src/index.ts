import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { initDb } from './database/db';
import { runMigrations } from './database/migrations';
import { startScanner } from './services/scanner';
import { swaggerSpec } from './swagger';
import { logger, httpLogger } from './logger';
import { isEmailConfigured } from './services/email';
import flightsRouter from './routes/flights';
import statsRouter from './routes/stats';
import authRouter from './routes/auth';
import userRouter from './routes/user';
import adminRouter from './routes/admin';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function start() {
  await initDb();
  runMigrations();
  startScanner();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(httpLogger);

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  app.use('/api/auth', authRouter);
  app.use('/api/user', userRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/flights', flightsRouter);
  app.use('/api/stats', statsRouter);

  // /api/log proxies to the log route on the flights router
  app.get('/api/log', (req, res) => {
    req.url = '/log';
    flightsRouter(req, res, () => {});
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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

  app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT, docs: `/api/docs` }, `Overhead backend running on http://0.0.0.0:${PORT}`);
  });
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
