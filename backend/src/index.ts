import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { initDb } from './database/db';
import { runMigrations } from './database/migrations';
import { startScanner } from './services/scanner';
import { swaggerSpec } from './swagger';
import { logger, httpLogger } from './logger';
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

  app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT, docs: `/api/docs` }, `Overhead backend running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start');
  process.exit(1);
});
