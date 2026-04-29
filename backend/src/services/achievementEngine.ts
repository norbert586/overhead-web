import { get, all, run } from '../database/db';

// ── Achievement definitions ───────────────────────────────────────────────────

export type AchievementCategory =
  | 'detection'
  | 'collection'
  | 'rare'
  | 'persistence'
  | 'signal'
  | 'country';

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  category: AchievementCategory;
  /** Returns true if userId has satisfied this achievement's criteria */
  check: (userId: number) => boolean;
}

// Widebody ICAO type codes (large commercial aircraft)
const WIDEBODY_TYPES = new Set([
  'B741','B742','B743','B744','B748','B74F','B74S',
  'B762','B763','B764','B772','B773','B77F','B77L','B77W','B788','B789','B78X',
  'A306','A30B','A310','A332','A333','A338','A339',
  'A342','A343','A344','A345','A346',
  'A359','A35K','A388',
  'IL96','A124','AN12','C5','C17',
]);

function isWidebody(typeCode: string | null): boolean {
  if (!typeCode) return false;
  return WIDEBODY_TYPES.has(typeCode.toUpperCase());
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Detection ───────────────────────────────────────────────────────────────
  {
    id: 'first_contact',
    label: 'First Contact',
    description: 'Log your first aircraft sighting.',
    category: 'detection',
    check: (userId) => {
      const r = get<{ count: number }>(
        'SELECT COUNT(*) as count FROM flights WHERE user_id = ?',
        [userId],
      );
      return (r?.count ?? 0) >= 1;
    },
  },
  {
    id: 'low_pass',
    label: 'Low Pass',
    description: 'Detect an aircraft at or below 1,000 ft.',
    category: 'detection',
    check: (userId) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(*) as count FROM flights
         WHERE user_id = ? AND altitude_ft IS NOT NULL AND altitude_ft <= 1000`,
        [userId],
      );
      return (r?.count ?? 0) >= 1;
    },
  },
  {
    id: 'high_cruiser',
    label: 'High Cruiser',
    description: 'Detect an aircraft cruising above 40,000 ft.',
    category: 'detection',
    check: (userId) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(*) as count FROM flights
         WHERE user_id = ? AND altitude_ft > 40000`,
        [userId],
      );
      return (r?.count ?? 0) >= 1;
    },
  },
  {
    id: 'night_watch',
    label: 'Night Watch',
    description: 'Detect an aircraft between 00:00–04:00 UTC.',
    category: 'detection',
    check: (userId) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(*) as count FROM flights
         WHERE user_id = ?
           AND CAST(substr(last_seen, 12, 2) AS INTEGER) < 4`,
        [userId],
      );
      return (r?.count ?? 0) >= 1;
    },
  },
  {
    id: 'heavy_iron',
    label: 'Heavy Iron',
    description: 'Detect a widebody aircraft (B747, B777, A380, etc.).',
    category: 'detection',
    check: (userId) => {
      const rows = all<{ aircraft_type: string }>(
        `SELECT DISTINCT aircraft_type FROM flights
         WHERE user_id = ? AND aircraft_type IS NOT NULL`,
        [userId],
      );
      return rows.some((r) => isWidebody(r.aircraft_type));
    },
  },

  // ── Collection ──────────────────────────────────────────────────────────────
  {
    id: 'hundred_sightings',
    label: 'Century Mark',
    description: 'Log 100 total sightings.',
    category: 'collection',
    check: (userId) => {
      const r = get<{ count: number }>(
        'SELECT COUNT(*) as count FROM flights WHERE user_id = ?',
        [userId],
      );
      return (r?.count ?? 0) >= 100;
    },
  },
  {
    id: 'five_hundred_sightings',
    label: 'Signal Strength',
    description: 'Log 500 total sightings.',
    category: 'collection',
    check: (userId) => {
      const r = get<{ count: number }>(
        'SELECT COUNT(*) as count FROM flights WHERE user_id = ?',
        [userId],
      );
      return (r?.count ?? 0) >= 500;
    },
  },
  {
    id: 'fifty_unique',
    label: 'Distinct Signatures',
    description: 'Track 50 unique aircraft.',
    category: 'collection',
    check: (userId) => {
      const r = get<{ count: number }>(
        'SELECT COUNT(DISTINCT hex) as count FROM flights WHERE user_id = ?',
        [userId],
      );
      return (r?.count ?? 0) >= 50;
    },
  },
  {
    id: 'two_fifty_unique',
    label: 'Broad Spectrum',
    description: 'Track 250 unique aircraft.',
    category: 'collection',
    check: (userId) => {
      const r = get<{ count: number }>(
        'SELECT COUNT(DISTINCT hex) as count FROM flights WHERE user_id = ?',
        [userId],
      );
      return (r?.count ?? 0) >= 250;
    },
  },
  {
    id: 'ten_countries',
    label: 'Global Coverage',
    description: 'Detect aircraft registered in 10 different countries.',
    category: 'collection',
    check: (userId) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(DISTINCT country) as count FROM flights
         WHERE user_id = ? AND country IS NOT NULL`,
        [userId],
      );
      return (r?.count ?? 0) >= 10;
    },
  },

  // ── Rare ────────────────────────────────────────────────────────────────────
  {
    id: 'military_contact',
    label: 'Military Contact',
    description: 'Detect a military aircraft.',
    category: 'rare',
    check: (userId) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(*) as count FROM flights
         WHERE user_id = ? AND classification = 'military'`,
        [userId],
      );
      return (r?.count ?? 0) >= 1;
    },
  },
  {
    id: 'government_vector',
    label: 'Government Vector',
    description: 'Detect a government aircraft.',
    category: 'rare',
    check: (userId) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(*) as count FROM flights
         WHERE user_id = ? AND classification = 'government'`,
        [userId],
      );
      return (r?.count ?? 0) >= 1;
    },
  },
  {
    id: 'repeat_contact',
    label: 'Repeat Contact',
    description: 'Log the same aircraft 10 or more times.',
    category: 'rare',
    check: (userId) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(*) as count FROM flights
         WHERE user_id = ? AND times_seen >= 10`,
        [userId],
      );
      return (r?.count ?? 0) >= 1;
    },
  },

  // ── Persistence ─────────────────────────────────────────────────────────────
  {
    id: 'seven_day_streak',
    label: 'Persistent',
    description: 'Record sightings on 7 distinct calendar days.',
    category: 'persistence',
    check: (userId) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(DISTINCT DATE(last_seen)) as count
         FROM flights WHERE user_id = ?`,
        [userId],
      );
      return (r?.count ?? 0) >= 7;
    },
  },
  {
    id: 'thirty_day_operator',
    label: 'Long Haul',
    description: 'Record sightings across 30 distinct calendar days.',
    category: 'persistence',
    check: (userId) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(DISTINCT DATE(last_seen)) as count
         FROM flights WHERE user_id = ?`,
        [userId],
      );
      return (r?.count ?? 0) >= 30;
    },
  },

  // ── Country contacts ─────────────────────────────────────────────────────────
  ...makeCountryAchievements(),
];

// Builds all country achievements from a compact definition table.
// Checks the aircraft registration country (most reliably populated field).
function makeCountryAchievements(): AchievementDef[] {
  const defs: [id: string, label: string, description: string, country: string][] = [
    ['country_usa',     'Stars and Stripes',    'Loud, constant, everywhere.',              'United States'],
    ['country_gbr',     'Crown and Steel',      'Old power. Still moving.',                 'United Kingdom'],
    ['country_fra',     'Tricolore',            'Style, precision, and presence.',          'France'],
    ['country_deu',     'Iron Order',           'Engineered. Controlled. Relentless.',      'Germany'],
    ['country_ita',     'Roman Blood',          'History runs deep here.',                  'Italy'],
    ['country_esp',     'Matador',              'Bold moves. No hesitation.',               'Spain'],
    ['country_nld',     'House of Orange',      'Small nation. Big reach.',                 'Netherlands'],
    ['country_che',     'Silent Vault',         'Quiet. Precise. Untouchable.',             'Switzerland'],
    ['country_swe',     'Nordic Steel',         'Cold. Clean. Efficient.',                  'Sweden'],
    ['country_nor',     'Fjordborn',            'Carved from harsh terrain.',               'Norway'],
    ['country_pol',     'Winged Hussars',       'When they show up, things change.',        'Poland'],
    ['country_tur',     'Gatekeeper',           'Where worlds collide.',                    'Turkey'],
    ['country_are',     'Desert Kings',         'Built fast. Built big.',                   'United Arab Emirates'],
    ['country_sau',     'Sandstorm',            'Power hidden in the heat.',                'Saudi Arabia'],
    ['country_qat',     'Black Gold',           'Small footprint. Massive influence.',      'Qatar'],
    ['country_ind',     'Monsoon',              'Intense. Unstoppable.',                    'India'],
    ['country_chn',     'Red Dragon',           'Ancient force. Modern scale.',             'China'],
    ['country_jpn',     'Rising Sun',           'Discipline meets precision.',              'Japan'],
    ['country_kor',     'Tiger Nation',         'Fast, sharp, relentless.',                 'South Korea'],
    ['country_sgp',     'Lion City',            'Small, but never overlooked.',             'Singapore'],
    ['country_tha',     'Golden Kingdom',       'Rich roots, strong presence.',             'Thailand'],
    ['country_idn',     'Island Empire',        'Spread wide. Hard to pin down.',           'Indonesia'],
    ['country_aus',     'Outback',              'Harsh land. Hard people.',                 'Australia'],
    ['country_nzl',     'All Blacks',           'Silent. Then overwhelming.',               'New Zealand'],
    ['country_bra',     'Carnival',             'Energy you can\'t ignore.',                'Brazil'],
    ['country_arg',     'Silver Nation',        'Pride runs deep.',                         'Argentina'],
    ['country_chl',     'Spine of the Earth',   'Long. Narrow. Unyielding.',               'Chile'],
    ['country_zaf',     'Springbok',            'Strength and resilience.',                 'South Africa'],
    ['country_egy',     'Pharaoh',              'Power that outlived time.',                'Egypt'],
    ['country_mar',     'Atlas',                'Gateway between worlds.',                  'Morocco'],
    ['country_eth',     'Abyssinia',            'Ancient and unbroken.',                    'Ethiopia'],
    ['country_ken',     'Equator',              'Right down the middle.',                   'Kenya'],
    ['country_nga',     'Giant of Africa',      'Loud. Growing. Impossible to ignore.',     'Nigeria'],
    ['country_rus',     'Iron Curtain',         'Vast. Cold. Watching.',                    'Russia'],
    ['country_ukr',     'Steppe',               'Open ground. Strong will.',                'Ukraine'],
    ['country_grc',     'Spartan',              'Discipline above all.',                    'Greece'],
    ['country_irl',     'Emerald Isle',         'Quiet, but never soft.',                   'Ireland'],
    ['country_prt',     'Navigators',           'Always pushing outward.',                  'Portugal'],
  ];

  return defs.map(([id, label, description, country]) => ({
    id,
    label,
    description,
    category: 'country' as AchievementCategory,
    check: (userId: number) => {
      const r = get<{ count: number }>(
        `SELECT COUNT(*) as count FROM flights WHERE user_id = ? AND country = ?`,
        [userId, country],
      );
      return (r?.count ?? 0) >= 1;
    },
  }));
}

// ── Achievement query helpers ─────────────────────────────────────────────────

interface AchievementRow extends Record<string, unknown> {
  achievement_id: string;
  unlocked_at: string;
}

function getUnlockedIds(userId: number): Set<string> {
  const rows = all<AchievementRow>(
    'SELECT achievement_id FROM user_achievements WHERE user_id = ?',
    [userId],
  );
  return new Set(rows.map((r) => r.achievement_id));
}

function insertAchievement(userId: number, achievementId: string): void {
  run(
    `INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
     VALUES (?, ?, ?)`,
    [userId, achievementId, new Date().toISOString()],
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface UnlockedAchievement {
  id: string;
  label: string;
  description: string;
  category: AchievementCategory;
  unlockedAt: string;
}

/**
 * Evaluate all achievements for a user. Only checks achievements not yet
 * unlocked. Returns the list of newly unlocked achievements this call.
 *
 * Designed to be called asynchronously after sighting ingestion — any
 * errors are caught so they never crash the scanner loop.
 */
export function evaluateAchievements(userId: number): string[] {
  try {
    const alreadyUnlocked = getUnlockedIds(userId);
    const newlyUnlocked: string[] = [];

    for (const def of ACHIEVEMENTS) {
      if (alreadyUnlocked.has(def.id)) continue;
      try {
        if (def.check(userId)) {
          insertAchievement(userId, def.id);
          newlyUnlocked.push(def.id);
        }
      } catch (err) {
        console.error(`[achievements] check failed for ${def.id}:`, err);
      }
    }

    if (newlyUnlocked.length > 0) {
      console.log(`[achievements] user=${userId} unlocked: ${newlyUnlocked.join(', ')}`);
    }

    return newlyUnlocked;
  } catch (err) {
    console.error('[achievements] evaluateAchievements error:', err);
    return [];
  }
}

/**
 * Return the full achievement roster for a user, with unlock status.
 */
export function getUserAchievements(userId: number): {
  unlocked: UnlockedAchievement[];
  locked: Omit<AchievementDef, 'check'>[];
} {
  const rows = all<AchievementRow>(
    'SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?',
    [userId],
  );
  const unlockedMap = new Map<string, string>(
    rows.map((r) => [r.achievement_id, r.unlocked_at]),
  );

  const unlocked: UnlockedAchievement[] = [];
  const locked: Omit<AchievementDef, 'check'>[] = [];

  for (const def of ACHIEVEMENTS) {
    const at = unlockedMap.get(def.id);
    if (at) {
      unlocked.push({ id: def.id, label: def.label, description: def.description, category: def.category, unlockedAt: at });
    } else {
      locked.push({ id: def.id, label: def.label, description: def.description, category: def.category });
    }
  }

  return { unlocked, locked };
}
