import { get, run } from '../database/db';

// ── Rank tier definitions ─────────────────────────────────────────────────────
//
// Score formula (tunable):
//   score = totalSightings × 1
//         + uniqueAircraft × 2
//         + rareSightings  × 5   (military + government)
//         + activeDays     × 3
//
// This weights breadth (unique aircraft) and rare signals above raw volume,
// and rewards longevity (days with data) to reflect sustained observation.

export interface RankTier {
  tier: string;
  label: string;
  minScore: number;
  description: string;
}

export const RANK_TIERS: RankTier[] = [
  {
    tier: 'OBSERVER',
    label: 'Observer',
    minScore: 0,
    description: 'Passive monitoring. No pattern established.',
  },
  {
    tier: 'ANALYST',
    label: 'Analyst',
    minScore: 100,
    description: 'Consistent observation. Signal emerging.',
  },
  {
    tier: 'TRACKER',
    label: 'Tracker',
    minScore: 300,
    description: 'Sustained coverage. Multiple classifications logged.',
  },
  {
    tier: 'SPOTTER',
    label: 'Spotter',
    minScore: 700,
    description: 'High-volume operation. Rare contacts recorded.',
  },
  {
    tier: 'SENTINEL',
    label: 'Sentinel',
    minScore: 1500,
    description: 'Continuous long-term surveillance. Deep dataset.',
  },
  {
    tier: 'INTELLIGENCE',
    label: 'Intelligence',
    minScore: 3500,
    description: 'Full-spectrum persistent observer. Maximum coverage.',
  },
];

export interface RankResult {
  score: number;
  tier: string;
  label: string;
  description: string;
  minScore: number;
  nextTier: string | null;
  nextLabel: string | null;
  nextThreshold: number | null;
  /** Score breakdown components */
  breakdown: {
    totalSightings: number;
    uniqueAircraft: number;
    rareSightings: number;
    activeDays: number;
  };
}

interface ScoreRow extends Record<string, unknown> {
  total_sightings: number;
  unique_aircraft: number;
  rare_sightings: number;
  active_days: number;
}

/**
 * Compute the user's rank score from flight data and return the full rank
 * result. Writes result to user_rank_cache so subsequent reads are free.
 *
 * Efficient: single aggregation query, uses existing idx_flights_user_id.
 */
export function calculateUserRank(userId: number): RankResult {
  const row = get<ScoreRow>(
    `SELECT
       COUNT(*)                                                    AS total_sightings,
       COUNT(DISTINCT hex)                                         AS unique_aircraft,
       SUM(CASE WHEN classification IN ('military','government')
                THEN 1 ELSE 0 END)                                AS rare_sightings,
       COUNT(DISTINCT DATE(last_seen))                            AS active_days
     FROM flights
     WHERE user_id = ?`,
    [userId],
  );

  const totalSightings = row?.total_sightings ?? 0;
  const uniqueAircraft = row?.unique_aircraft ?? 0;
  const rareSightings  = row?.rare_sightings  ?? 0;
  const activeDays     = row?.active_days     ?? 0;

  const score =
    totalSightings * 1 +
    uniqueAircraft * 2 +
    rareSightings  * 5 +
    activeDays     * 3;

  // Walk tiers in descending order — pick the highest threshold the score meets
  const tierDef =
    [...RANK_TIERS].reverse().find((t) => score >= t.minScore) ?? RANK_TIERS[0];
  const tierIdx = RANK_TIERS.findIndex((t) => t.tier === tierDef.tier);
  const nextDef = RANK_TIERS[tierIdx + 1] ?? null;

  // Persist to cache so GET /rank can skip recomputation if desired
  run(
    `INSERT INTO user_rank_cache (user_id, score, tier, computed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       score       = excluded.score,
       tier        = excluded.tier,
       computed_at = excluded.computed_at`,
    [userId, score, tierDef.tier, new Date().toISOString()],
  );

  return {
    score,
    tier:          tierDef.tier,
    label:         tierDef.label,
    description:   tierDef.description,
    minScore:      tierDef.minScore,
    nextTier:      nextDef?.tier      ?? null,
    nextLabel:     nextDef?.label     ?? null,
    nextThreshold: nextDef?.minScore  ?? null,
    breakdown: { totalSightings, uniqueAircraft, rareSightings, activeDays },
  };
}
