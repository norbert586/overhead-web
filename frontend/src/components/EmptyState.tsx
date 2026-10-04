import type { ApiErrorKind } from '../services/api';
import { useNow } from '../hooks/useNow';

export type EmptyVariant =
  | 'no-settings'
  | 'no-aircraft'
  | 'geo-loading'
  | 'geo-denied'
  | 'no-aircraft-overhead'
  | 'feed-error';

interface EmptyStateProps {
  variant: EmptyVariant;
  onOpenSettings?: () => void;
  onRetry?: () => void;
  /** For 'feed-error': what failed, which decides the message. */
  errorKind?: ApiErrorKind | null;
  /** For 'feed-error': epoch ms of the next automatic retry. */
  nextRetryAt?: number | null;
}

function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

function NoSettings({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <div className="empty-full">
      <PlaneIcon className="empty-icon" />
      <div className="empty-title">No location configured</div>
      <div className="empty-body">Configure your coordinates to begin monitoring.</div>
      {onOpenSettings && (
        <div className="empty-hint" onClick={onOpenSettings} style={{ cursor: 'pointer' }}>
          Open settings →
        </div>
      )}
    </div>
  );
}

function NoAircraft() {
  return (
    <div className="empty-full">
      <PlaneIcon className="empty-icon" />
      <div className="empty-title">Nothing to show here</div>
      <div className="empty-body">This page isn't available for your account.</div>
    </div>
  );
}

function GeoLoading() {
  return (
    <div className="empty-full">
      <PlaneIcon className="empty-icon" />
      <div className="empty-title">Locating you…</div>
      <div className="empty-body">Reading your device's location to find aircraft directly overhead.</div>
    </div>
  );
}

function GeoDenied({ onRetry, onOpenSettings }: { onRetry?: () => void; onOpenSettings?: () => void }) {
  return (
    <div className="empty-full empty-error">
      <PlaneIcon className="empty-icon empty-icon-error" />
      <div className="empty-title empty-title-error">Location unavailable</div>
      <div className="empty-body empty-body-error">
        Overhead needs to know where you are to catch flights. Allow location access in your
        browser, or set a home location in Settings to catch from there instead.
      </div>
      {onRetry && (
        <button type="button" className="empty-error-retry" onClick={onRetry}>
          Try again
        </button>
      )}
      {onOpenSettings && (
        <div className="empty-hint" onClick={onOpenSettings} style={{ cursor: 'pointer' }}>
          Set a home location →
        </div>
      )}
    </div>
  );
}

function NoAircraftOverhead() {
  return (
    <div className="empty-full listening-state">
      {/* The hearing radius, live: faint range rings with sound waves
          expanding from your position. */}
      <div className="listening-scope" aria-hidden>
        <div className="listening-crosshair" />
        <div className="listening-ring listening-ring--range1" />
        <div className="listening-ring listening-ring--range2" />
        <div className="listening-wave listening-wave--1" />
        <div className="listening-wave listening-wave--2" />
        <div className="listening-wave listening-wave--3" />
        <div className="listening-center" />
      </div>
      <div className="empty-title">Listening</div>
      <div className="empty-body">
        Nothing in hearing range right now. Whatever crosses your radius gets caught automatically.
      </div>
    </div>
  );
}

// Each failure gets its own honest explanation. Everything used to read
// "this is on the data side, not your device" — including an expired
// session and a phone with no signal.
const FEED_ERROR_COPY: Record<ApiErrorKind, { title: string; body: string }> = {
  upstream: {
    title: 'Live feeds not answering',
    body: "The public ADS-B networks we read aircraft from aren't responding. Your phone and connection are fine — catching picks back up the moment a feed answers.",
  },
  server: {
    title: 'Reconnecting to Overhead',
    body: "Our server didn't answer. This is usually a quick restart after an update.",
  },
  offline: {
    title: 'No connection',
    body: "This device can't reach the internet right now. We'll reconnect as soon as you have signal.",
  },
  timeout: {
    title: 'Slow connection',
    body: 'The last request took too long — the signal here may be weak. Trying again.',
  },
  'rate-limited': {
    title: 'Taking a breather',
    body: 'Too many requests from this network. Sign in for uninterrupted live data.',
  },
  auth: {
    title: 'Session expired',
    body: 'Sign in again to keep catching.',
  },
};

function FeedError({
  kind,
  nextRetryAt,
  onRetry,
}: {
  kind: ApiErrorKind;
  nextRetryAt?: number | null;
  onRetry?: () => void;
}) {
  const copy = FEED_ERROR_COPY[kind];
  const now = useNow(!!nextRetryAt);
  const secs = nextRetryAt ? Math.max(0, Math.ceil((nextRetryAt - now) / 1000)) : null;
  return (
    <div className="empty-full empty-error" role="alert">
      <PlaneIcon className="empty-icon empty-icon-error" />
      <div className="empty-title empty-title-error">{copy.title}</div>
      <div className="empty-body empty-body-error">{copy.body}</div>
      {kind !== 'auth' && (
        <div className="empty-retry-row">
          <span className="empty-retry-status">
            {secs === null || secs === 0 ? 'Retrying…' : `Retrying in ${secs}s`}
          </span>
          {onRetry && (
            <button type="button" className="empty-error-retry" onClick={onRetry}>
              Retry now
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmptyState({ variant, onOpenSettings, onRetry, errorKind, nextRetryAt }: EmptyStateProps) {
  if (variant === 'no-settings')          return <NoSettings onOpenSettings={onOpenSettings} />;
  if (variant === 'geo-loading')          return <GeoLoading />;
  if (variant === 'geo-denied')           return <GeoDenied onRetry={onRetry} onOpenSettings={onOpenSettings} />;
  if (variant === 'no-aircraft-overhead') return <NoAircraftOverhead />;
  if (variant === 'feed-error')           return <FeedError kind={errorKind ?? 'server'} nextRetryAt={nextRetryAt} onRetry={onRetry} />;
  return <NoAircraft />;
}
