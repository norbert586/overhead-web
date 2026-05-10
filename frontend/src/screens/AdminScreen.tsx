import { useEffect, useState } from 'react';
import {
  fetchAdminOverview,
  fetchAdminUsers,
  fetchChangelog,
  adminResetUserPassword,
  type AdminOverview,
  type AdminUser,
  type AdminResetPasswordResponse,
} from '../services/api';

type Tab = 'overview' | 'users' | 'changelog';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Tiny markdown renderer scoped to the changelog format we generate:
// `# Heading`, `## Heading`, `- bullet`, links `[text](url)`, blank lines.
function renderChangelog(md: string) {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let bulletBuf: React.ReactNode[] = [];

  function flushBullets() {
    if (bulletBuf.length) {
      out.push(<ul key={`ul-${out.length}`} className="admin-changelog-list">{bulletBuf}</ul>);
      bulletBuf = [];
    }
  }

  function renderInline(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(
        <a key={i++} href={m[2]} target="_blank" rel="noreferrer noopener" className="admin-changelog-link">
          {m[1]}
        </a>,
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');

    if (line.startsWith('## ')) {
      flushBullets();
      out.push(<h3 key={`h3-${i}`} className="admin-changelog-date">{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      flushBullets();
      // Skip the top-level "# Changelog" — it's redundant with the page title
    } else if (line.startsWith('- ')) {
      bulletBuf.push(<li key={`li-${i}`}>{renderInline(line.slice(2))}</li>);
    } else if (line.length === 0) {
      flushBullets();
    } else {
      flushBullets();
      out.push(<p key={`p-${i}`} className="admin-changelog-para">{renderInline(line)}</p>);
    }
  }
  flushBullets();
  return out;
}

export default function AdminScreen() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [changelog, setChangelog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<AdminResetPasswordResponse | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleResetPassword(user: AdminUser) {
    const ok = window.confirm(
      `Reset password for ${user.email}? Their current password will stop working immediately.`,
    );
    if (!ok) return;
    setResettingId(user.id);
    setResetError(null);
    setCopied(false);
    try {
      const result = await adminResetUserPassword(user.id);
      setResetResult(result);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setResettingId(null);
    }
  }

  async function copyTempPassword() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.tempPassword);
      setCopied(true);
    } catch {
      // Clipboard API can fail on insecure contexts — fall back silently.
    }
  }

  function closeResetModal() {
    setResetResult(null);
    setCopied(false);
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchAdminOverview(), fetchAdminUsers(), fetchChangelog()])
      .then(([o, u, c]) => {
        setOverview(o);
        setUsers(u.users);
        setChangelog(c.markdown);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="admin-screen">
      <div className="admin-header">
        <span className="admin-title">ADMIN · OVERVIEW</span>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab${tab === 'overview' ? ' active' : ''}`}
          onClick={() => setTab('overview')}
        >Overview</button>
        <button
          className={`admin-tab${tab === 'users' ? ' active' : ''}`}
          onClick={() => setTab('users')}
        >Users{users ? ` · ${users.length}` : ''}</button>
        <button
          className={`admin-tab${tab === 'changelog' ? ' active' : ''}`}
          onClick={() => setTab('changelog')}
        >Changelog</button>
      </div>

      {loading && <div className="admin-loading">Loading…</div>}
      {error && !loading && <div className="admin-error">Failed to load admin data: {error}</div>}

      {!loading && !error && tab === 'overview' && overview && (
        <div className="admin-grid">
          <AdminMetric label="Total users" value={overview.totalUsers} />
          <AdminMetric label="Admins" value={overview.adminUsers} />
          <AdminMetric label="With location set" value={overview.usersWithLocation} />
          <AdminMetric label="New users · 24h" value={overview.newUsers24h} />
          <AdminMetric label="New users · 7d" value={overview.newUsers7d} />
          <AdminMetric label="Flights · all time" value={overview.totalFlights} />
          <AdminMetric label="Unique aircraft" value={overview.uniqueAircraftAllUsers} />
          <AdminMetric label="Flights · 24h" value={overview.flights24h} />
          <AdminMetric label="Cached aircraft" value={overview.cachedAircraft} />
          <AdminMetric label="Cached callsigns" value={overview.cachedCallsigns} />
        </div>
      )}

      {!loading && !error && tab === 'users' && users && (
        <>
          {resetError && (
            <div className="admin-error" style={{ marginBottom: 12 }}>
              Reset failed: {resetError}
            </div>
          )}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Joined</th>
                  <th>Last seen</th>
                  <th className="admin-num">Flights</th>
                  <th className="admin-num">Unique</th>
                  <th>Loc</th>
                  <th>Admin</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td className="admin-email">{u.email}</td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>{timeAgo(u.lastSeenAt)}</td>
                    <td className="admin-num">{u.totalFlights.toLocaleString()}</td>
                    <td className="admin-num">{u.uniqueAircraft.toLocaleString()}</td>
                    <td>{u.hasLocation ? '✓' : '—'}</td>
                    <td>{u.isAdmin ? '✓' : '—'}</td>
                    <td>
                      <button
                        className="admin-row-action"
                        onClick={() => handleResetPassword(u)}
                        disabled={resettingId === u.id}
                      >
                        {resettingId === u.id ? 'Resetting…' : 'Reset password'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {resetResult && (
        <div className="admin-modal-backdrop" onClick={closeResetModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-modal-title">Temporary password generated</h3>
            <p className="admin-modal-body">
              Hand this to <strong>{resetResult.email}</strong> out-of-band.
              It is shown only once.
            </p>
            <div className="admin-modal-password">
              <code>{resetResult.tempPassword}</code>
              <button className="admin-row-action" onClick={copyTempPassword}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="admin-modal-actions">
              <button className="admin-row-action" onClick={closeResetModal}>Done</button>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && tab === 'changelog' && (
        <div className="admin-changelog">
          {changelog && changelog.trim()
            ? renderChangelog(changelog)
            : <div className="admin-loading">No changelog entries yet.</div>}
        </div>
      )}
    </div>
  );
}

function AdminMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-metric">
      <span className="admin-metric-label">{label}</span>
      <span className="admin-metric-value">{value.toLocaleString()}</span>
    </div>
  );
}
