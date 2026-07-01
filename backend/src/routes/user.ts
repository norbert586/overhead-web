import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { findUserById, getUserSettings, updateUserSettings } from '../database/queries';
import { clampCatchRadius, CATCH_RADIUS_DEFAULT_NM } from '../config';
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
    radiusNm: settings?.radiusNm ?? CATCH_RADIUS_DEFAULT_NM,
  });
});

/**
 * @openapi
 * /api/user/profile:
 *   put:
 *     summary: Update the authenticated user's fallback location and hearing radius
 *     tags: [User]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               latitude: { type: number, nullable: true }
 *               longitude: { type: number, nullable: true }
 *               radiusNm: { type: number, minimum: 1, maximum: 15 }
 *     responses:
 *       200: { description: Updated profile }
 */
router.put('/profile', requireAuth, (req: Request, res: Response) => {
  const { latitude, longitude, radiusNm } = req.body as {
    latitude?: number | null;
    longitude?: number | null;
    radiusNm?: number;
  };

  const lat = typeof latitude === 'number' ? latitude : null;
  const lon = typeof longitude === 'number' ? longitude : null;
  const radius = clampCatchRadius(radiusNm);

  updateUserSettings(req.userId, {
    latitude: lat,
    longitude: lon,
    radiusNm: radius,
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
