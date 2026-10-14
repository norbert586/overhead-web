// The sky dome: your sky as a fisheye, straight up at the centre and the
// horizon at the rim, north at the top. It is tinted the colour the sky
// actually is at the catch point right now (sun altitude → zenith/horizon
// colours), the sun sits where it really is, and every aircraft is placed at
// its real bearing and height above the horizon — so "what is that?" comes
// with "where do I look?". Map orientation (east on the right), because the
// phone is read held flat, not overhead like a star chart.

import { useId, useMemo } from 'react';
import { useNow } from '../hooks/useNow';
import { elevationDeg, skyColors, sunPosition } from '../utils/sky';
import type { Flight } from '../types/flight';

const SIZE = 240;
const C = SIZE / 2;
const R = 100; // horizon radius

/** Sky position → SVG point. elevation 90 = centre, 0 = rim. */
function project(azimuth: number, elevation: number) {
  const r = R * (1 - Math.max(0, Math.min(90, elevation)) / 90);
  const a = (azimuth * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

// Deterministic star field — the same sky every render, no flicker.
const STARS = Array.from({ length: 46 }, (_, i) => {
  const t = Math.sin(i * 12.9898) * 43758.5453;
  const u = Math.sin(i * 78.233) * 12543.1234;
  const fa = t - Math.floor(t);
  const fr = u - Math.floor(u);
  const r = R * Math.sqrt(fr) * 0.97;
  const a = fa * Math.PI * 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a), s: 0.5 + ((i * 7) % 5) * 0.18, d: (i % 7) * 0.6 };
});

interface SkyDomeProps {
  latitude: number | null;
  longitude: number | null;
  flights?: Flight[];
  activeHex?: string | null;
  onSelect?: (hex: string) => void;
  /** Idle: nothing overhead, the dome breathes. */
  listening?: boolean;
  className?: string;
}

export default function SkyDome({
  latitude,
  longitude,
  flights = [],
  activeHex = null,
  onSelect,
  listening = false,
  className = '',
}: SkyDomeProps) {
  const uid = useId().replace(/:/g, '');
  // The sun moves ~¼° a minute; once a minute is plenty.
  const now = useNow(true, 60_000);
  const sun = latitude !== null && longitude !== null ? sunPosition(new Date(now), latitude, longitude) : null;
  // No position yet: assume day so the dome isn't a black hole on first paint.
  const sky = skyColors(sun?.altitude ?? 30);
  const ink = sky.dark ? '255 255 255' : '16 40 72';

  const blips = useMemo(() => flights
    .map((f) => {
      const el = elevationDeg(f.altitudeFt, f.distanceNm);
      if (el === null || f.azimuthDeg == null) return null;
      return { f, el, ...project(f.azimuthDeg, el) };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    // Active last so it draws on top.
    .sort((a, b) => Number(a.f.hex === activeHex) - Number(b.f.hex === activeHex)),
  [flights, activeHex]);

  const sunPt = sun && sun.altitude > -1 ? project(sun.azimuth, Math.max(0, sun.altitude)) : null;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={`sky-dome${listening ? ' sky-dome--listening' : ''}${sky.dark ? ' sky-dome--night' : ''} ${className}`}
      // A group when the planes are tappable; otherwise a picture.
      role={onSelect ? 'group' : 'img'}
      aria-label={blips.length ? 'Where each aircraft is in your sky' : 'Your sky, listening for aircraft'}
    >
      <defs>
        <radialGradient id={`sky-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={sky.zenith} />
          <stop offset="62%" stopColor={sky.zenith} stopOpacity="0.92" />
          <stop offset="100%" stopColor={sky.horizon} />
        </radialGradient>
        <radialGradient id={`sun-${uid}`}>
          <stop offset="0%" stopColor="#FFF6D8" />
          <stop offset="35%" stopColor="#FFE7A3" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FFD27A" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`clip-${uid}`}>
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>

      {/* Compass ticks outside the horizon, every 30°. */}
      <g className="sky-dome-ticks">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const r1 = R + 4;
          const r2 = R + (i % 3 === 0 ? 4 : 8);
          return (
            <line key={i}
              x1={C + r1 * Math.sin(a)} y1={C - r1 * Math.cos(a)}
              x2={C + r2 * Math.sin(a)} y2={C - r2 * Math.cos(a)} />
          );
        })}
      </g>
      {(['N', 'E', 'S', 'W'] as const).map((l, i) => {
        const a = (i * 90 * Math.PI) / 180;
        const r = R + 13;
        return (
          <text key={l} x={C + r * Math.sin(a)} y={C - r * Math.cos(a)} className={`sky-dome-cardinal${l === 'N' ? ' sky-dome-cardinal--n' : ''}`}
            textAnchor="middle" dominantBaseline="central">{l}</text>
        );
      })}

      <g clipPath={`url(#clip-${uid})`}>
        <circle cx={C} cy={C} r={R} fill={`url(#sky-${uid})`} className="sky-dome-sky" />
        {sky.stars > 0.02 && (
          <g className="sky-dome-stars" opacity={sky.stars}>
            {STARS.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.s} style={{ animationDelay: `${s.d}s` }} />
            ))}
          </g>
        )}
        {sunPt && (
          <g className="sky-dome-sun">
            <circle cx={sunPt.x} cy={sunPt.y} r={22} fill={`url(#sun-${uid})`} />
            <circle cx={sunPt.x} cy={sunPt.y} r={5.5} fill="#FFF8E4" />
          </g>
        )}
        {/* Height-above-horizon rings: 30° and 60°. */}
        <g fill="none" stroke={`rgb(${ink} / 0.22)`} strokeWidth="0.75" strokeDasharray="2 3">
          <circle cx={C} cy={C} r={R * (2 / 3)} />
          <circle cx={C} cy={C} r={R / 3} />
        </g>
        <g stroke={`rgb(${ink} / 0.12)`} strokeWidth="0.75">
          <line x1={C} y1={C - R} x2={C} y2={C + R} />
          <line x1={C - R} y1={C} x2={C + R} y2={C} />
        </g>
        {listening && (
          <g className="sky-dome-waves" fill="none" stroke={`rgb(${ink} / 0.55)`}>
            <circle cx={C} cy={C} r={R} />
            <circle cx={C} cy={C} r={R} />
            <circle cx={C} cy={C} r={R} />
          </g>
        )}
        <circle cx={C} cy={C} r={2.5} fill={`rgb(${ink} / 0.75)`} />
      </g>
      <circle cx={C} cy={C} r={R} fill="none" className="sky-dome-horizon" />

      {blips.map(({ f, x, y }) => {
        const active = f.hex === activeHex;
        return (
          <g
            key={f.hex}
            className={`sky-blip${active ? ' sky-blip--active' : ''}${f.timesSeen === 1 ? ' sky-blip--new' : ''}`}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
            onClick={onSelect ? () => onSelect(f.hex) : undefined}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-label={onSelect ? `Show ${f.callsign ?? f.registration ?? 'aircraft'}` : undefined}
            onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(f.hex); } } : undefined}
          >
            {/* Generous invisible hit area for thumbs. */}
            <circle r={16} fill="transparent" />
            {active && <circle r={13} className="sky-blip-ring" />}
            <g transform={`rotate(${Math.round(f.bearingDeg ?? 0)}) scale(${active ? 1.15 : 0.8})`}>
              <path className="sky-blip-glyph" d="M0 -9 C1 -9 1.6 -7.6 1.6 -5.6 L1.6 -2.4 L8.4 1.6 L8.4 3 L1.6 1 L1.6 5.4 L4 7.4 L4 8.6 L0 7.6 L-4 8.6 L-4 7.4 L-1.6 5.4 L-1.6 1 L-8.4 3 L-8.4 1.6 L-1.6 -2.4 L-1.6 -5.6 C-1.6 -7.6 -1 -9 0 -9 Z" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
