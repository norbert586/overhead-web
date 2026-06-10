import { get, all, run } from '../database/db';
import { logger } from '../logger';

const log = logger.child({ module: 'achievements' });

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
  /** Returns true if the user's stats snapshot satisfies this achievement */
  check: (ctx: AchievementContext) => boolean;
}

/**
 * Snapshot of everything the achievement checks need, built once per
 * evaluation from three queries. Checking ~130 achievements against this is
 * pure in-memory work — previously each check ran its own COUNT query.
 */
export interface AchievementContext {
  totalSightings: number;
  uniqueAircraft: number;
  distinctDays: number;
  maxTimesSeen: number;
  maxInterestScore: number;
  rareTierCount: number;
  lowAltitudeCount: number;   // altitude_ft <= 1000
  highAltitudeCount: number;  // altitude_ft > 40000
  nightCount: number;         // 00:00–04:00 UTC
  militaryCount: number;
  governmentCount: number;
  aircraftTypes: Set<string>;
  countries: Set<string>;
}

function buildContext(userId: number): AchievementContext {
  const summary = get<{
    total: number; unique_hex: number; days: number;
    max_times_seen: number; max_interest: number; rare_count: number;
    low_alt: number; high_alt: number; night_count: number;
    military_count: number; government_count: number;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT hex) AS unique_hex,
       COUNT(DISTINCT DATE(last_seen)) AS days,
       COALESCE(MAX(times_seen), 0) AS max_times_seen,
       COALESCE(MAX(interest_score), 0) AS max_interest,
       COALESCE(SUM(CASE WHEN interest_tier = 'rare' THEN 1 ELSE 0 END), 0) AS rare_count,
       COALESCE(SUM(CASE WHEN altitude_ft IS NOT NULL AND altitude_ft <= 1000 THEN 1 ELSE 0 END), 0) AS low_alt,
       COALESCE(SUM(CASE WHEN altitude_ft > 40000 THEN 1 ELSE 0 END), 0) AS high_alt,
       COALESCE(SUM(CASE WHEN CAST(substr(last_seen, 12, 2) AS INTEGER) < 4 THEN 1 ELSE 0 END), 0) AS night_count,
       COALESCE(SUM(CASE WHEN classification = 'military' THEN 1 ELSE 0 END), 0) AS military_count,
       COALESCE(SUM(CASE WHEN classification = 'government' THEN 1 ELSE 0 END), 0) AS government_count
     FROM flights WHERE user_id = ?`,
    [userId],
  );

  const typeRows = all<{ aircraft_type: string }>(
    `SELECT DISTINCT aircraft_type FROM flights
     WHERE user_id = ? AND aircraft_type IS NOT NULL`,
    [userId],
  );
  const countryRows = all<{ country: string }>(
    `SELECT DISTINCT country FROM flights
     WHERE user_id = ? AND country IS NOT NULL`,
    [userId],
  );

  return {
    totalSightings:    summary?.total            ?? 0,
    uniqueAircraft:    summary?.unique_hex       ?? 0,
    distinctDays:      summary?.days             ?? 0,
    maxTimesSeen:      summary?.max_times_seen   ?? 0,
    maxInterestScore:  summary?.max_interest     ?? 0,
    rareTierCount:     summary?.rare_count       ?? 0,
    lowAltitudeCount:  summary?.low_alt          ?? 0,
    highAltitudeCount: summary?.high_alt         ?? 0,
    nightCount:        summary?.night_count      ?? 0,
    militaryCount:     summary?.military_count   ?? 0,
    governmentCount:   summary?.government_count ?? 0,
    aircraftTypes:     new Set(typeRows.map((r) => r.aircraft_type)),
    countries:         new Set(countryRows.map((r) => r.country)),
  };
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
    check: (ctx) => ctx.totalSightings >= 1,
  },
  {
    id: 'low_pass',
    label: 'Low Pass',
    description: 'Detect an aircraft at or below 1,000 ft.',
    category: 'detection',
    check: (ctx) => ctx.lowAltitudeCount >= 1,
  },
  {
    id: 'high_cruiser',
    label: 'High Cruiser',
    description: 'Detect an aircraft cruising above 40,000 ft.',
    category: 'detection',
    check: (ctx) => ctx.highAltitudeCount >= 1,
  },
  {
    id: 'night_watch',
    label: 'Night Watch',
    description: 'Detect an aircraft between 00:00–04:00 UTC.',
    category: 'detection',
    check: (ctx) => ctx.nightCount >= 1,
  },
  {
    id: 'heavy_iron',
    label: 'Heavy Iron',
    description: 'Detect a widebody aircraft (B747, B777, A380, etc.).',
    category: 'detection',
    check: (ctx) => [...ctx.aircraftTypes].some(isWidebody),
  },

  // ── Collection ──────────────────────────────────────────────────────────────
  {
    id: 'hundred_sightings',
    label: 'Century Mark',
    description: 'Log 100 total sightings.',
    category: 'collection',
    check: (ctx) => ctx.totalSightings >= 100,
  },
  {
    id: 'five_hundred_sightings',
    label: 'Signal Strength',
    description: 'Log 500 total sightings.',
    category: 'collection',
    check: (ctx) => ctx.totalSightings >= 500,
  },
  {
    id: 'fifty_unique',
    label: 'Distinct Signatures',
    description: 'Track 50 unique aircraft.',
    category: 'collection',
    check: (ctx) => ctx.uniqueAircraft >= 50,
  },
  {
    id: 'two_fifty_unique',
    label: 'Broad Spectrum',
    description: 'Track 250 unique aircraft.',
    category: 'collection',
    check: (ctx) => ctx.uniqueAircraft >= 250,
  },
  {
    id: 'ten_countries',
    label: 'Global Coverage',
    description: 'Detect aircraft registered in 10 different countries.',
    category: 'collection',
    check: (ctx) => ctx.countries.size >= 10,
  },

  // ── Rare ────────────────────────────────────────────────────────────────────
  {
    id: 'military_contact',
    label: 'Military Contact',
    description: 'Detect a military aircraft.',
    category: 'rare',
    check: (ctx) => ctx.militaryCount >= 1,
  },
  {
    id: 'government_vector',
    label: 'Government Vector',
    description: 'Detect a government aircraft.',
    category: 'rare',
    check: (ctx) => ctx.governmentCount >= 1,
  },
  {
    id: 'repeat_contact',
    label: 'Repeat Contact',
    description: 'Log the same aircraft 10 or more times.',
    category: 'rare',
    check: (ctx) => ctx.maxTimesSeen >= 10,
  },
  {
    id: 'rare_tier_contact',
    label: 'Rare Bird',
    description: 'Detect an aircraft scored at the "rare" tier.',
    category: 'rare',
    check: (ctx) => ctx.rareTierCount >= 1,
  },
  {
    id: 'score_hunter',
    label: 'Score Hunter',
    description: 'Detect a flight with an interest score of 90 or higher.',
    category: 'rare',
    check: (ctx) => ctx.maxInterestScore >= 90,
  },
  {
    id: 'unicorn_hunter',
    label: 'Unicorn Hunter',
    description: 'Detect 10 flights at the "rare" tier.',
    category: 'rare',
    check: (ctx) => ctx.rareTierCount >= 10,
  },
  {
    id: 'variety_pack',
    label: 'Variety Pack',
    description: 'Track 25 distinct aircraft types.',
    category: 'collection',
    check: (ctx) => ctx.aircraftTypes.size >= 25,
  },

  // ── Persistence ─────────────────────────────────────────────────────────────
  {
    id: 'seven_day_streak',
    label: 'Persistent',
    description: 'Record sightings on 7 distinct calendar days.',
    category: 'persistence',
    check: (ctx) => ctx.distinctDays >= 7,
  },
  {
    id: 'thirty_day_operator',
    label: 'Long Haul',
    description: 'Record sightings across 30 distinct calendar days.',
    category: 'persistence',
    check: (ctx) => ctx.distinctDays >= 30,
  },

  // ── Country contacts ─────────────────────────────────────────────────────────
  ...makeCountryAchievements(),
];

// Builds all country achievements from a compact definition table.
// Checks the aircraft registration country (most reliably populated field).
function makeCountryAchievements(): AchievementDef[] {
  const defs: [id: string, label: string, description: string, country: string][] = [
    // ── Europe ──────────────────────────────────────────────────────────────
    ['country_gbr',  'Spitfire Shadows',           "Watched flights over the British Isles. Empire's skies still echo.",                 'United Kingdom'],
    ['country_fra',  'Legionnaire Overflight',     'Spotted aircraft over the land of the Foreign Legion. Vive la France... from above.','France'],
    ['country_deu',  'Luftwaffe Legacy',           'Tracked flights over the Fatherland. Blitzkrieg never truly ended.',                  'Germany'],
    ['country_ita',  'Roman Eagle Recon',          'Flights over the Eternal City. All roads — and contrails — lead to Rome.',           'Italy'],
    ['country_esp',  'Reconquista Raiders',        'Aircraft over Spain. The Moors and Conquistadors still battle in the clouds.',        'Spain'],
    ['country_nld',  'Dutch East India Air',       'Aircraft over the Netherlands. Trading empires evolve.',                              'Netherlands'],
    ['country_che',  'Neutral Bankers in the Sky', 'Flights over Switzerland. Money has no borders.',                                     'Switzerland'],
    ['country_swe',  'Viking Air Raiders',         'Logged Swedish skies. The North remembers.',                                          'Sweden'],
    ['country_nor',  'Midnight Sun Warriors',      'Aircraft over Norway. Fjords hide more than just oil.',                               'Norway'],
    ['country_pol',  'Winged Hussar Overwatch',    'Flights over Poland. Cavalry charges evolved into jet streams.',                      'Poland'],
    ['country_grc',  'Spartan Missile Watch',      'Flights over Hellas. This is where legends take flight.',                            'Greece'],
    ['country_irl',  'Emerald Isle Raiders',       'Flights over Ireland. The troubles reach new heights.',                               'Ireland'],
    ['country_prt',  'Age of Discovery Drifters',  'Tracked Portuguese skies. Explorers never stopped flying.',                          'Portugal'],
    ['country_bel',  'Congo Free State Ghosts',    'Logged Belgian skies. Dark colonial history from above.',                             'Belgium'],
    ['country_aut',  'Habsburg Eagle Squadron',    "Aircraft over Austria. Empire's shadow still flies.",                                'Austria'],
    ['country_hun',  'Magyar Arrow Cross',         'Tracked Hungarian skies. Warriors of the plains.',                                    'Hungary'],
    ['country_rou',  "Dracula's Night Wings",      'Flights over Romania. Blood-red contrails at dusk.',                                 'Romania'],
    ['country_bgr',  'Thracian Shadow Fleet',      'Logged Bulgarian airspace. Ancient warriors reborn.',                                 'Bulgaria'],
    ['country_srb',  'Balkan Phantom Eagles',      'Aircraft over Serbia. Never forget the skies above Kosovo.',                         'Serbia'],
    ['country_fin',  'White Death Watch',          'Tracked Finnish airspace. Sniper ghosts in the winter skies.',                       'Finland'],
    ['country_isl',  'Fire and Ice Sentries',      'Tracked Icelandic airspace. Vikings of the north.',                                  'Iceland'],
    ['country_dnk',  'Viking Berserker Wings',     'Aircraft over Denmark. Raiders reborn.',                                             'Denmark'],
    ['country_est',  'Baltic Digital Ghosts',      'Flights over Estonia. Tiny but wired for war.',                                      'Estonia'],
    ['country_lva',  'Baltic Amber Eagles',        'Logged Latvian skies. Amber waves of conflict.',                                     'Latvia'],
    ['country_ltu',  'Forest Brothers Air',        'Aircraft over Lithuania. Partisans never die.',                                      'Lithuania'],
    ['country_blr',  "Last Dictator Sky",          "Tracked Belarusian airspace. Europe's last fortress.",                               'Belarus'],
    ['country_mda',  'Wine Country Phantoms',      'Flights over Moldova. Sweet but contested.',                                         'Moldova'],
    // ── Post-Soviet / Caucasus ───────────────────────────────────────────────
    ['country_rus',  'Bear Squadron',              'Logged Russian skies. The bear still patrols these borders.',                        'Russia'],
    ['country_ukr',  'Steppe Ghost Fleet',         'Flights over Ukraine. The fight for the skies never stopped.',                       'Ukraine'],
    ['country_geo',  "Caucasus Mountain Lords",    "Aircraft over Georgia. Mountains don't forget.",                                     'Georgia'],
    ['country_arm',  'Ararat Shadow Watch',        'Logged Armenian skies. Biblical heights.',                                           'Armenia'],
    ['country_aze',  'Caspian Oil Hawks',          'Flights over Azerbaijan. Black gold in the sky.',                                    'Azerbaijan'],
    ['country_kaz',  'Steppe Silk Road Ghosts',    'Tracked Kazakh skies. Nomads own these vast routes.',                               'Kazakhstan'],
    ['country_uzb',  'Timurid Empire Flyers',      'Flights over Uzbekistan. Ancient conquerors reborn.',                               'Uzbekistan'],
    ['country_mng',  'Genghis Khan Horde Air',     'Aircraft over Mongolia. The Great Khan conquers the skies.',                        'Mongolia'],
    // ── North America ────────────────────────────────────────────────────────
    ['country_usa',  'Yankee Death From Above',    "American airspace logged. Freedom isn't free — and neither is your flight data.",   'United States'],
    ['country_can',  'Great White North Sentries', 'Flights over Canada. Polite... until you cross the border.',                        'Canada'],
    ['country_mex',  'Cartel Contrails',           'Flights over Mexico. The border never sleeps.',                                     'Mexico'],
    ['country_cub',  'Bay of Pigs Patrol',         'Tracked Cuban skies. Revolution still flies these routes.',                         'Cuba'],
    // ── South America ────────────────────────────────────────────────────────
    ['country_bra',  'Amazon Bandit Wings',        'Aircraft over the Amazon. Law of the jungle applies at altitude.',                   'Brazil'],
    ['country_arg',  'Falklands Phantom',          'Logged Argentine skies. The Malvinas still call.',                                   'Argentina'],
    ['country_chl',  'Andes Pinochet Watch',       'Logged Chilean skies. Mountains hide old ghosts.',                                   'Chile'],
    ['country_col',  'Cocaine Air Bridge',         'Logged Colombian airspace. White lines in the sky.',                                'Colombia'],
    ['country_ven',  'Bolivarian Sky Command',     'Aircraft over Venezuela. Revolution at cruising altitude.',                         'Venezuela'],
    ['country_bol',  'High Altitude Che Watch',    'Flights over Bolivia. Revolutionaries own the thin air.',                           'Bolivia'],
    ['country_per',  'Inca Eagle Recon',           'Flights over Peru. Ancient lines visible only from above.',                         'Peru'],
    // ── Middle East ──────────────────────────────────────────────────────────
    ['country_tur',  'Ottoman Janissary Jets',     'Aircraft over Anatolia. The sick man of Europe fights from above.',                  'Turkey'],
    ['country_are',  'Desert Kings',               'Built fast. Built big.',                                                             'United Arab Emirates'],
    ['country_sau',  'Oil Sheik Sentries',         'Watched Saudi skies. Black gold flows beneath these contrails.',                    'Saudi Arabia'],
    ['country_qat',  'Desert Pearl Falcons',       'Aircraft over Qatar. Wealth buys the best wings.',                                  'Qatar'],
    ['country_isr',  'Iron Dome Defender',         'Watched the skies over Israel. Never again — from above.',                         'Israel'],
    ['country_irn',  'Revolutionary Guards Air',   'Flights over Persia. The Axis of Resistance patrols the skies.',                   'Iran'],
    ['country_irq',  'Babylon Scud Watch',         'Logged Iraqi skies. Cradle of civilization, modern battlefield.',                   'Iraq'],
    ['country_syr',  'Levant Phantom Patrol',      'Aircraft over Syria. Ancient ruins watch new wars.',                                'Syria'],
    ['country_jor',  'Transjordan Sentinels',      'Flights over Jordan. Desert kings guard these borders.',                            'Jordan'],
    ['country_omn',  'Incense Route Sentries',     'Tracked Omani skies. Ancient trade now carries jet fuel.',                         'Oman'],
    ['country_kwt',  'Gulf Storm Ghosts',          'Logged Kuwaiti skies. The storm never fully passed.',                               'Kuwait'],
    ['country_lbn',  'Cedar Revolution Air',       'Flights over Lebanon. Fragile peace at altitude.',                                  'Lebanon'],
    ['country_yem',  'Arabian Abyss Watch',        'Flights over Yemen. The abyss stares back.',                                        'Yemen'],
    // ── South & Southeast Asia ───────────────────────────────────────────────
    ['country_ind',  'Mughal Sky Empire',          'Tracked aircraft over India. The subcontinent strikes back.',                       'India'],
    ['country_pak',  'Khyber Pass Phantoms',       'Logged Pakistani skies. Mountain warriors own these altitudes.',                    'Pakistan'],
    ['country_bgd',  'Bengal Tiger Contrails',     'Logged Bangladeshi skies. Delta warriors from above.',                              'Bangladesh'],
    ['country_lka',  'Teardrop Tiger Watch',       'Flights over Sri Lanka. Island fortress in the Indian Ocean.',                     'Sri Lanka'],
    ['country_afg',  'Mujahideen MiG Hunters',     "Flights over the Graveyard of Empires. They can't shoot you down from orbit... yet.", 'Afghanistan'],
    ['country_mys',  'Tiger of the Strait',        'Aircraft over Malaysia. The tiger still prowls these routes.',                     'Malaysia'],
    ['country_tha',  'Land of Smiles Shadows',     'Tracked Thai airspace. Smiles hide sharp teeth at altitude.',                      'Thailand'],
    ['country_idn',  'Archipelago Empire Hawks',   'Aircraft over the islands. Spice routes now carry jet fuel.',                      'Indonesia'],
    ['country_phl',  'Pacific Pearl Hunters',      'Flights over the Philippines. Island fortress in the sky.',                        'Philippines'],
    ['country_vnm',  'Ho Chi Minh Ghosts',         'Tracked flights over Vietnam. The trail remains.',                                  'Vietnam'],
    // ── East Asia ────────────────────────────────────────────────────────────
    ['country_chn',  "Dragon's Air Legion",        'Logged flights over the Middle Kingdom. The dragon awakens in the skies.',          'China'],
    ['country_jpn',  'Rising Sun Kamikaze',        'Tracked flights over the Land of the Rising Sun. Divine wind still blows.',         'Japan'],
    ['country_kor',  'Morning Calm Defenders',     'Flights over South Korea. Calm before the storm from above.',                      'South Korea'],
    ['country_prk',  'Dear Leader Missile Watch',  'Flights near the Hermit Kingdom. Big Brother is flying.',                          'North Korea'],
    ['country_sgp',  'Lion City Air Guard',        'Aircraft over Singapore. Small island, massive reach.',                             'Singapore'],
    // ── Oceania ──────────────────────────────────────────────────────────────
    ['country_aus',  'Outback Dropbear Patrol',    'Logged Australian skies. Watch for dropbears... and aircraft.',                    'Australia'],
    ['country_nzl',  'Long White Cloud Lords',     'Tracked New Zealand skies. Kiwi wings over Middle Earth.',                         'New Zealand'],
    // ── North & East Africa ──────────────────────────────────────────────────
    ['country_egy',  "Pharaoh's Falcons",          'Aircraft over the Pyramids. The ancient gods are watching.',                       'Egypt'],
    ['country_eth',  'Abyssinian Lion Kings',      'Logged Ethiopian airspace. Never colonized, never forgotten.',                     'Ethiopia'],
    ['country_ken',  'Mau Mau Sky Watch',          'Flights over Kenya. The uprising continues in contrails.',                         'Kenya'],
    ['country_sdn',  'Nile Empire Shadows',        'Logged Sudanese airspace. Two nations, one dangerous sky.',                        'Sudan'],
    ['country_som',  'Pirate Coast Sky Lords',     'Aircraft over Somalia. Modern pirates hunt from above.',                           'Somalia'],
    ['country_tza',  'Zanzibar Ghost Traders',     'Aircraft over Tanzania. Spice island skies.',                                      'Tanzania'],
    ['country_dza',  'FLN Shadow Fleet',           'Aircraft over Algeria. Independence won, skies still contested.',                  'Algeria'],
    ['country_lby',  'Gaddafi Sky Mercs',          'Logged Libyan airspace. Mad dog of the desert still haunts these routes.',         'Libya'],
    ['country_tun',  'Carthage Phoenix Squadron',  'Aircraft over Tunisia. Reborn from ancient ashes.',                                'Tunisia'],
    ['country_mar',  'Barbary Coast Corsairs',     'Tracked Moroccan skies. Pirates of the modern age.',                               'Morocco'],
    // ── West Africa ──────────────────────────────────────────────────────────
    ['country_nga',  '419 Phantom Fleet',          'Aircraft over Nigeria. Prince of the skies offers you a deal.',                    'Nigeria'],
    ['country_gha',  'Gold Coast Empire',          'Tracked Ghanaian skies. Black star rising.',                                       'Ghana'],
    ['country_sen',  'Teranga Sky Warriors',       'Flights over Senegal. Hospitality with teeth.',                                    'Senegal'],
    ['country_civ',  'Cocoa Contrail Kings',       'Logged Ivorian airspace. Sweet on the surface.',                                   'Ivory Coast'],
    ['country_cmr',  'Lions of Africa Air',        'Aircraft over Cameroon. Indomitable from above.',                                  'Cameroon'],
    // ── Central & Southern Africa ────────────────────────────────────────────
    ['country_cod',  'Heart of Darkness Patrol',   'Tracked Congolese skies. Darkness finds you even at 30,000 feet.',                'Democratic Republic of the Congo'],
    ['country_ago',  'Cuban Proxy Aces',           'Logged Angolan airspace. Cold War ghosts linger.',                                 'Angola'],
    ['country_zaf',  'Rainbow Reapers',            'Flights over the Rainbow Nation. Some colors run red.',                            'South Africa'],
    ['country_zwe',  'Rhodesian Security Forces',  'Logged flights over the old Rhodesia. Fireforce on station — stay frosty.',        'Zimbabwe'],
    ['country_zmb',  'Northern Rhodesia Watch',    'Flights over Zambia. Old name, new battles.',                                      'Zambia'],
    ['country_bwa',  'Kalahari Diamond Hawks',     'Tracked Botswanan skies. Gems hidden in vast emptiness.',                         'Botswana'],
    ['country_nam',  'Skeleton Coast Phantoms',    'Aircraft over Namibia. Shipwrecks and sky wrecks.',                                'Namibia'],
    ['country_moz',  'RENAMO Shadow Fleet',        'Logged Mozambican airspace. Civil war echoes.',                                    'Mozambique'],
    ['country_mdg',  'Lemur Island Drifters',      'Flights over Madagascar. Lost world in the skies.',                                'Madagascar'],
  ];

  return defs.map(([id, label, description, country]) => ({
    id,
    label,
    description,
    category: 'country' as AchievementCategory,
    check: (ctx: AchievementContext) => ctx.countries.has(country),
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

// The scanner calls evaluateAchievements after every batch (~12s). Stats only
// drift by one sighting per cycle, so re-evaluating every cycle is wasted
// work — cap it per user. Unlocks can lag by up to this interval.
const EVAL_INTERVAL_MS = 5 * 60 * 1000;
const lastEvalAt = new Map<number, number>();

/**
 * Evaluate all achievements for a user. Only checks achievements not yet
 * unlocked, and at most once per EVAL_INTERVAL_MS per user. Returns the
 * list of newly unlocked achievements this call.
 *
 * Designed to be called asynchronously after sighting ingestion — any
 * errors are caught so they never crash the scanner loop.
 */
export function evaluateAchievements(userId: number): string[] {
  const now = Date.now();
  if (now - (lastEvalAt.get(userId) ?? 0) < EVAL_INTERVAL_MS) return [];
  lastEvalAt.set(userId, now);

  try {
    const alreadyUnlocked = getUnlockedIds(userId);
    const locked = ACHIEVEMENTS.filter((def) => !alreadyUnlocked.has(def.id));
    if (locked.length === 0) return [];

    const ctx = buildContext(userId);
    const newlyUnlocked: string[] = [];

    for (const def of locked) {
      try {
        if (def.check(ctx)) {
          insertAchievement(userId, def.id);
          newlyUnlocked.push(def.id);
        }
      } catch (err) {
        log.error({ err, achievementId: def.id }, 'achievement check failed');
      }
    }

    if (newlyUnlocked.length > 0) {
      log.info({ userId, unlocked: newlyUnlocked }, 'achievements unlocked');
    }

    return newlyUnlocked;
  } catch (err) {
    log.error({ err }, 'evaluateAchievements error');
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
