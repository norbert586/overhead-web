import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { findUserById, getUserSettings, updateUserSettings } from '../database/queries';
import { getUserAchievements, ACHIEVEMENTS } from '../services/achievementEngine';
import { calculateUserRank, RANK_TIERS } from '../services/rankSystem';

const router = Router();

/**
 * @openapi
 * /api/user/profile:
 *   get:
 *     summary: Get the authenticated user's profile and location settings
 *     tags: [User]
 *     responses:
 *       200: { description: User profile }
 *       404: { description: User not found }
 */
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
    isAdmin: !!user.is_admin,
    emailVerified: !!user.email_verified_at,
    latitude: settings?.latitude ?? null,
    longitude: settings?.longitude ?? null,
    radiusNm: settings?.radiusNm ?? 25,
    pollIntervalSec: settings?.pollIntervalSec ?? 12,
  });
});

/**
 * @openapi
 * /api/user/profile:
 *   put:
 *     summary: Update the authenticated user's location and polling settings
 *     tags: [User]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               latitude: { type: number, nullable: true }
 *               longitude: { type: number, nullable: true }
 *               radiusNm: { type: number, minimum: 1, maximum: 500 }
 *               pollIntervalSec: { type: number, minimum: 5, maximum: 300 }
 *     responses:
 *       200: { description: Updated profile }
 */
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
    isAdmin: !!user!.is_admin,
    emailVerified: !!user!.email_verified_at,
    latitude: lat,
    longitude: lon,
    radiusNm: radius,
    pollIntervalSec: interval,
  });
});

/**
 * @openapi
 * /api/user/achievements:
 *   get:
 *     summary: List unlocked and locked achievements for the authenticated user
 *     tags: [User]
 *     responses:
 *       200: { description: Achievements }
 */
router.get('/achievements', requireAuth, (_req: Request, res: Response) => {
  const { unlocked, locked } = getUserAchievements(_req.userId);
  res.json({
    unlocked,
    locked,
    total: ACHIEVEMENTS.length,
    unlockedCount: unlocked.length,
  });
});

/**
 * @openapi
 * /api/user/rank:
 *   get:
 *     summary: Get the authenticated user's rank tier and progress
 *     tags: [User]
 *     responses:
 *       200: { description: Rank info with tier definitions }
 */
router.get('/rank', requireAuth, (_req: Request, res: Response) => {
  const rank = calculateUserRank(_req.userId);
  res.json({ ...rank, tiers: RANK_TIERS.map(({ tier, label, minScore, description }) => ({ tier, label, minScore, description })) });
});

export default router;
