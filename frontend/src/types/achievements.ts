export type AchievementCategory = 'detection' | 'collection' | 'rare' | 'persistence' | 'signal';

export interface UnlockedAchievement {
  id: string;
  label: string;
  description: string;
  category: AchievementCategory;
  unlockedAt: string;
}

export interface LockedAchievement {
  id: string;
  label: string;
  description: string;
  category: AchievementCategory;
}

export interface AchievementsResponse {
  unlocked: UnlockedAchievement[];
  locked: LockedAchievement[];
  total: number;
  unlockedCount: number;
}

export interface RankTier {
  tier: string;
  label: string;
  minScore: number;
  description: string;
}

export interface RankBreakdown {
  totalSightings: number;
  uniqueAircraft: number;
  rareSightings: number;
  activeDays: number;
}

export interface RankResponse {
  score: number;
  tier: string;
  label: string;
  description: string;
  minScore: number;
  nextTier: string | null;
  nextLabel: string | null;
  nextThreshold: number | null;
  breakdown: RankBreakdown;
  tiers: RankTier[];
}
