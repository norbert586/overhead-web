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

const router = Router();
router.use(requireAuth);

function handle<T>(name: string, fn: (userId: number) => T) {
  return (req: Request, res: Response) => {
    try {
      res.json(fn(req.userId));
    } catch (err) {
      console.error(`GET /api/stats/${name} error:`, err);
      res.status(500).json({ error: `Failed to load ${name}` });
    }
  };
}

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
