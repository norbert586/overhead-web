import { Router, Request, Response } from 'express';
import {
  getStatsSummary,
  getStatsAltitude,
  getStatsActivity,
  getStatsAircraftTypes,
  getStatsOperators,
  getStatsCountries,
  getStatsRoutes,
  getStatsNotable,
  getStatsMostSeen,
} from '../database/queries';
import { requireAuth } from '../middleware/auth';
import { logger } from '../logger';

const log = logger.child({ module: 'stats' });

const router = Router();
router.use(requireAuth);

function handle<T>(name: string, fn: (userId: number) => T) {
  return (req: Request, res: Response) => {
    try {
      res.json(fn(req.userId));
    } catch (err) {
      log.error({ err, stat: name }, 'stats handler error');
      res.status(500).json({ error: `Failed to load ${name}` });
    }
  };
}

/**
 * @openapi
 * /api/stats/summary:
 *   get:
 *     summary: High-level stats summary for the authenticated user
 *     tags: [Stats]
 *     responses:
 *       200: { description: Summary stats }
 * /api/stats/altitude:
 *   get:
 *     summary: Altitude distribution of recorded sightings
 *     tags: [Stats]
 *     responses:
 *       200: { description: Altitude buckets }
 * /api/stats/activity:
 *   get:
 *     summary: Sighting activity over time
 *     tags: [Stats]
 *     responses:
 *       200: { description: Activity series }
 * /api/stats/aircraft-types:
 *   get:
 *     summary: Top aircraft types by sightings
 *     tags: [Stats]
 *     responses:
 *       200: { description: Aircraft type counts }
 * /api/stats/operators:
 *   get:
 *     summary: Top operators by sightings
 *     tags: [Stats]
 *     responses:
 *       200: { description: Operator counts }
 * /api/stats/countries:
 *   get:
 *     summary: Top countries of origin by sightings
 *     tags: [Stats]
 *     responses:
 *       200: { description: Country counts }
 * /api/stats/routes:
 *   get:
 *     summary: Top observed origin-destination routes
 *     tags: [Stats]
 *     responses:
 *       200: { description: Route counts }
 * /api/stats/notable:
 *   get:
 *     summary: Notable sightings (rare types, distant routes, etc.)
 *     tags: [Stats]
 *     responses:
 *       200: { description: Notable sightings }
 * /api/stats/most-seen:
 *   get:
 *     summary: Most-seen aircraft for the authenticated user
 *     tags: [Stats]
 *     responses:
 *       200: { description: Most-seen list }
 */
router.get('/summary',        handle('summary',        getStatsSummary));
router.get('/altitude',       handle('altitude',       getStatsAltitude));
router.get('/activity',       handle('activity',       getStatsActivity));
router.get('/aircraft-types', handle('aircraft-types', getStatsAircraftTypes));
router.get('/operators',      handle('operators',      getStatsOperators));
router.get('/countries',      handle('countries',      getStatsCountries));
router.get('/routes',         handle('routes',         getStatsRoutes));
router.get('/notable',        handle('notable',        getStatsNotable));
router.get('/most-seen',      handle('most-seen',      getStatsMostSeen));

export default router;
