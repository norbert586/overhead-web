import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { findUserById, getUserSettings, updateUserSettings } from '../database/queries';

const router = Router();

// GET /api/user/profile
router.get('/profile', requireAuth, (req: Request, res: Response) => {
  const user = findUserById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const settings = getUserSettings(req.userId);
  res.json({
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
    latitude: settings?.latitude ?? null,
    longitude: settings?.longitude ?? null,
    radiusNm: settings?.radiusNm ?? 25,
    pollIntervalSec: settings?.pollIntervalSec ?? 12,
  });
});

// PUT /api/user/profile
router.put('/profile', requireAuth, (req: Request, res: Response) => {
  const { latitude, longitude, radiusNm, pollIntervalSec } = req.body as {
    latitude?: number | null;
    longitude?: number | null;
    radiusNm?: number;
    pollIntervalSec?: number;
  };

  const lat = typeof latitude === 'number' ? latitude : null;
  const lon = typeof longitude === 'number' ? longitude : null;
  const radius = typeof radiusNm === 'number' && radiusNm >= 1 && radiusNm <= 500 ? radiusNm : 25;
  const interval = typeof pollIntervalSec === 'number' && pollIntervalSec >= 5 && pollIntervalSec <= 300 ? pollIntervalSec : 12;

  updateUserSettings(req.userId, {
    latitude: lat,
    longitude: lon,
    radiusNm: radius,
    pollIntervalSec: interval,
  });

  const user = findUserById(req.userId);
  res.json({
    id: user!.id,
    email: user!.email,
    createdAt: user!.created_at,
    latitude: lat,
    longitude: lon,
    radiusNm: radius,
    pollIntervalSec: interval,
  });
});

export default router;
