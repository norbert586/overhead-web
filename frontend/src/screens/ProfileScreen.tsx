import { useState, useEffect, type ReactElement } from 'react';
import { fetchAchievements, fetchRank } from '../services/api';
import type {
  AchievementsResponse,
  RankResponse,
  AchievementCategory,
} from '../types/achievements';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function progressPct(score: number, min: number, max: number | null): number {
  if (max === null) return 100;
  if (max <= min) return 100;
  return Math.min(100, Math.round(((score - min) / (max - min)) * 100));
}

// ── Category labels ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  detection:   'Detection',
  collection:  'Collection',
  rare:        'Rare Signal',
  persistence: 'Persistence',
  signal:      'Signal',
  country:     'Country Contacts',
};

const CATEGORY_ORDER: AchievementCategory[] = [
  'detection', 'collection', 'rare', 'persistence', 'signal', 'country',
];

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconDetection() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
      <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCollection() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="13" width="4" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="9" width="4" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="17" y="5" width="4" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconRare() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconPersistence() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1" />
      <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="7" y="13" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.7" />
      <rect x="14" y="13" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function IconSignal() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconCountry() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3a14.5 14.5 0 0 1 4 9 14.5 14.5 0 0 1-4 9 14.5 14.5 0 0 1-4-9 14.5 14.5 0 0 1 4-9z"
        fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const CATEGORY_ICONS: Record<AchievementCategory, () => ReactElement> = {
  detection:   IconDetection,
  collection:  IconCollection,
  rare:        IconRare,
  persistence: IconPersistence,
  signal:      IconSignal,
  country:     IconCountry,
};

// ── Achievement ID → specific icon override ───────────────────────────────────
// For specific well-known achievements we use a more descriptive icon

function AchievementIcon({ id, category, unlocked }: {
  id: string;
  category: AchievementCategory;
  unlocked: boolean;
}) {
  const overrides: Record<string, () => ReactElement> = {
    low_pass: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </svg>
    ),
    high_cruiser: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        <line x1="2" y1="4" x2="22" y2="4" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" opacity="0.5" />
      </svg>
    ),
    military_contact: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    government_vector: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21V12h6v9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    night_watch: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    repeat_contact: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <polyline points="17 1 21 5 17 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <polyline points="7 23 3 19 7 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  };

  const Icon = overrides[id] ?? CATEGORY_ICONS[category];
  return (
    <div className={`achievement-icon${unlocked ? ' unlocked' : ' locked'}`}>
      <Icon />
    </div>
  );
}

// ── Score explainer ───────────────────────────────────────────────────────────

const FORMULA_ROWS = [
  { component: 'Total Sightings',  multiplier: '× 1', note: 'Raw observation volume' },
  { component: 'Unique Aircraft',  multiplier: '× 2', note: 'Breadth of airspace coverage' },
  { component: 'Rare Signals',     multiplier: '× 5', note: 'Military / government contacts', highlight: true },
  { component: 'Active Days',      multiplier: '× 3', note: 'Sustained, consistent operation' },
];

function ScoreExplainer() {
  return (
    <div className="profile-score-explainer">
      <div className="profile-section-label">How Scoring Works</div>
      <div className="score-formula-table">
        {FORMULA_ROWS.map(({ component, multiplier, note, highlight }) => (
          <div key={component} className={`score-formula-row${highlight ? ' score-formula-highlight' : ''}`}>
            <span className="score-formula-component">{component}</span>
            <span className="score-formula-multiplier">{multiplier}</span>
            <span className="score-formula-note">{note}</span>
          </div>
        ))}
      </div>
      <p className="score-formula-context">
        Rare signals (military and government aircraft) are weighted 5× because they represent genuine
        intelligence value — difficult to acquire, high signal-to-noise ratio. Rank reflects
        the quality and persistence of observation, not session count alone.
      </p>
    </div>
  );
}

// ── Rank tier color ───────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  OBSERVER:     '#5a6370',
  ANALYST:      '#5b9bd5',
  TRACKER:      '#9b7ec8',
  SPOTTER:      '#c4935a',
  SENTINEL:     '#d4864a',
  INTELLIGENCE: '#7eb8e0',
};

function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? '#5a6370';
}

// ── Rank Card ─────────────────────────────────────────────────────────────────

function RankCard({ rank }: { rank: RankResponse }) {
  const pct = progressPct(rank.score, rank.minScore, rank.nextThreshold);
  const color = tierColor(rank.tier);

  return (
    <div className="profile-rank-card">
      <div className="profile-rank-header">
        <div className="profile-rank-badge" style={{ '--tier-color': color } as React.CSSProperties}>
          <div className="profile-rank-tier">{rank.tier}</div>
        </div>
        <div className="profile-rank-meta">
          <div className="profile-rank-label">{rank.label}</div>
          <div className="profile-rank-description">{rank.description}</div>
        </div>
        <div className="profile-rank-score">
          <span className="profile-rank-score-value">{rank.score.toLocaleString()}</span>
          <span className="profile-rank-score-unit">pts</span>
        </div>
      </div>

      <div className="profile-rank-progress-wrap">
        <div className="profile-rank-progress-bar">
          <div
            className="profile-rank-progress-fill"
            style={{ width: `${pct}%`, '--tier-color': color } as React.CSSProperties}
          />
        </div>
        {rank.nextTier ? (
          <div className="profile-rank-progress-labels">
            <span>{rank.tier}</span>
            <span className="profile-rank-progress-next">
              {rank.nextLabel} · {rank.nextThreshold?.toLocaleString()} pts
            </span>
          </div>
        ) : (
          <div className="profile-rank-progress-labels">
            <span>{rank.tier}</span>
            <span className="profile-rank-max">Max rank achieved</span>
          </div>
        )}
      </div>

      <div className="profile-rank-breakdown">
        <div className="profile-rank-breakdown-item">
          <span className="profile-breakdown-label">Sightings</span>
          <span className="profile-breakdown-value">{rank.breakdown.totalSightings.toLocaleString()}</span>
          <span className="profile-breakdown-pts">×1</span>
        </div>
        <div className="profile-rank-breakdown-item">
          <span className="profile-breakdown-label">Unique Aircraft</span>
          <span className="profile-breakdown-value">{rank.breakdown.uniqueAircraft.toLocaleString()}</span>
          <span className="profile-breakdown-pts">×2</span>
        </div>
        <div className="profile-rank-breakdown-item">
          <span className="profile-breakdown-label">Rare Signals</span>
          <span className="profile-breakdown-value">{rank.breakdown.rareSightings.toLocaleString()}</span>
          <span className="profile-breakdown-pts">×5</span>
        </div>
        <div className="profile-rank-breakdown-item">
          <span className="profile-breakdown-label">Active Days</span>
          <span className="profile-breakdown-value">{rank.breakdown.activeDays.toLocaleString()}</span>
          <span className="profile-breakdown-pts">×3</span>
        </div>
      </div>
    </div>
  );
}

// ── Achievement Card ──────────────────────────────────────────────────────────

function AchievementCard({
  id,
  label,
  description,
  category,
  unlocked,
  unlockedAt,
}: {
  id: string;
  label: string;
  description: string;
  category: AchievementCategory;
  unlocked: boolean;
  unlockedAt?: string;
}) {
  return (
    <div className={`achievement-card${unlocked ? ' achievement-unlocked' : ' achievement-locked'}`}>
      <AchievementIcon id={id} category={category} unlocked={unlocked} />
      <div className="achievement-text">
        <div className="achievement-label">{label}</div>
        <div className="achievement-description">{description}</div>
        {unlocked && unlockedAt && (
          <div className="achievement-unlocked-at">{timeAgo(unlockedAt)}</div>
        )}
      </div>
    </div>
  );
}

// ── Main Profile Screen ───────────────────────────────────────────────────────

type Tab = 'rank' | 'achievements';

export default function ProfileScreen({ userEmail }: { userEmail?: string }) {
  const [tab, setTab] = useState<Tab>('rank');
  const [achievements, setAchievements] = useState<AchievementsResponse | null>(null);
  const [rank, setRank] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    Promise.all([fetchRank(), fetchAchievements()])
      .then(([r, a]) => {
        setRank(r);
        setAchievements(a);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  // Group achievements by category for the grid
  const grouped = achievements
    ? CATEGORY_ORDER.reduce<Record<string, { unlocked: typeof achievements.unlocked[0][]; locked: typeof achievements.locked[0][] }>>((acc, cat) => {
        acc[cat] = {
          unlocked: achievements.unlocked.filter((a) => a.category === cat),
          locked:   achievements.locked.filter((a) => a.category === cat),
        };
        return acc;
      }, {} as Record<string, { unlocked: typeof achievements.unlocked[0][]; locked: typeof achievements.locked[0][] }>)
    : null;

  return (
    <div className="profile-screen">
      {/* Header */}
      <div className="profile-header">
        <div className="profile-identity">
          <div className="profile-avatar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="profile-identity-text">
            <div className="profile-email">{userEmail ?? '—'}</div>
            {rank && (
              <div className="profile-tier-inline" style={{ color: tierColor(rank.tier) }}>
                {rank.tier}
              </div>
            )}
          </div>
        </div>

        {achievements && (
          <div className="profile-summary-stats">
            <div className="profile-summary-stat">
              <span className="profile-summary-value">{achievements.unlockedCount}</span>
              <span className="profile-summary-label">/ {achievements.total} unlocked</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        <button
          className={`profile-tab${tab === 'rank' ? ' active' : ''}`}
          onClick={() => setTab('rank')}
        >
          Rank
        </button>
        <button
          className={`profile-tab${tab === 'achievements' ? ' active' : ''}`}
          onClick={() => setTab('achievements')}
        >
          Achievements
          {achievements && achievements.unlockedCount > 0 && (
            <span className="profile-tab-badge">{achievements.unlockedCount}</span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="profile-content">
        {loading && (
          <div className="profile-loading">
            <div className="profile-loading-dot" />
            <span>Loading profile data…</span>
          </div>
        )}

        {error && !loading && (
          <div className="profile-error">Failed to load profile data.</div>
        )}

        {!loading && !error && tab === 'rank' && rank && (
          <div className="profile-rank-section">
            <RankCard rank={rank} />

            <ScoreExplainer />

            <div className="profile-tiers-section">
              <div className="profile-section-label">Rank Progression</div>
              <div className="profile-tiers-list">
                {rank.tiers.map((t) => {
                  const isActive = t.tier === rank.tier;
                  const isPast   = rank.score >= t.minScore;
                  return (
                    <div
                      key={t.tier}
                      className={`profile-tier-row${isActive ? ' current' : ''}${isPast ? ' achieved' : ''}`}
                    >
                      <div
                        className="profile-tier-indicator"
                        style={{ background: isPast ? tierColor(t.tier) : undefined }}
                      />
                      <div className="profile-tier-info">
                        <span className="profile-tier-name" style={isActive ? { color: tierColor(t.tier) } : undefined}>
                          {t.label}
                          {isActive && <span className="profile-tier-current-tag">current</span>}
                        </span>
                        <span className="profile-tier-desc">{t.description}</span>
                      </div>
                      <div className="profile-tier-threshold">
                        {t.minScore === 0 ? '—' : `${t.minScore.toLocaleString()} pts`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && tab === 'achievements' && achievements && grouped && (
          <div className="profile-achievements-section">
            {CATEGORY_ORDER.map((cat) => {
              const g = grouped[cat];
              if (!g || (g.unlocked.length === 0 && g.locked.length === 0)) return null;
              return (
                <div key={cat} className="achievement-group">
                  <div className="achievement-group-header">
                    <span className="achievement-group-label">{CATEGORY_LABELS[cat]}</span>
                    <span className="achievement-group-count">
                      {g.unlocked.length}/{g.unlocked.length + g.locked.length}
                    </span>
                  </div>
                  <div className="achievement-grid">
                    {g.unlocked.map((a) => (
                      <AchievementCard
                        key={a.id}
                        id={a.id}
                        label={a.label}
                        description={a.description}
                        category={a.category}
                        unlocked
                        unlockedAt={a.unlockedAt}
                      />
                    ))}
                    {g.locked.map((a) => (
                      <AchievementCard
                        key={a.id}
                        id={a.id}
                        label={a.label}
                        description={a.description}
                        category={a.category}
                        unlocked={false}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
