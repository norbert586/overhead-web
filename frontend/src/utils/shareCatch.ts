// The "Share catch" message: a few plain lines meant to be pasted into a text
// to a friend. Most of the people receiving it aren't spotters, so it speaks
// in everyday terms — model names over ICAO codes, miles and mph over nm and
// knots — and ends with one link, which gives them somewhere to go (the guest
// view shows what's over them right now) and is the only URL in the message,
// so Messages unfurls it into the site's preview card.

import type { Flight } from '../types/flight';
import { rosterName } from '../data/typeRoster';
import { bearingToCardinal } from './formatting';

export const SHARE_URL = 'https://overheadflight.com';

const NM_TO_MI = 1.15078;

export type ShareMode =
  /** On the catch screen, saved to the user's log. */
  | 'caught'
  /** On the catch screen, not saved: a guest, or outside the hearing radius. */
  | 'live'
  /** From the flight log, after the fact. */
  | 'log';

export interface ShareOptions {
  mode: ShareMode;
  /** The aircraft is beyond the hearing radius (display-only expansion). */
  nearby?: boolean;
  now?: Date;
}

// Squawk/emergency reasons can be spurious, and a forwarded text saying
// "hijack" can't be taken back. Reasons written to "you" are about the
// sender's own log and read wrong in their message.
const UNSHAREABLE_REASON = /\bsquawk\b|emergency|unlawful|downed|minimum fuel|nordo|\byou/i;

function modelName(f: Flight): string | null {
  return rosterName(f.aircraftType) ?? ([f.manufacturer, f.aircraftType].filter(Boolean).join(' ') || null);
}

// "an Airbus A320", "an F-16", "a C-17": initials like F and H are said with a vowel sound.
function withArticle(model: string): string {
  return `${/^([aeiou]|[fhlmnrsx](?=[-\d]))/i.test(model) ? 'an' : 'a'} ${model}`;
}

function airport(iata: string | null, city: string | null): string | null {
  if (iata && city) return `${city} (${iata})`;
  return iata ?? city;
}

function routeLine(f: Flight): string | null {
  const from = airport(f.originIata, f.originCity);
  const to = airport(f.destinationIata, f.destinationCity);
  if (from && to) return `🛫 ${from} → ${to}`;
  if (from) return `🛫 From ${from}`;
  if (to) return `🛫 To ${to}`;
  return null;
}

function miles(nm: number): string {
  const mi = nm * NM_TO_MI;
  return mi < 10 ? mi.toFixed(1) : String(Math.round(mi));
}

function feet(ft: number): string {
  const rounded = ft >= 1000 ? Math.round(ft / 100) * 100 : Math.round(ft / 10) * 10;
  return rounded.toLocaleString('en-US');
}

function telemetryLine(f: Flight): string | null {
  const parts: string[] = [];
  if (f.distanceNm != null) parts.push(`${miles(f.distanceNm)} mi away`);
  if (f.altitudeFt != null && f.altitudeFt > 0) parts.push(`${feet(f.altitudeFt)} ft up`);
  const heading = f.bearingDeg != null ? `heading ${bearingToCardinal(f.bearingDeg)}` : null;
  const mph = f.speedKts != null && f.speedKts > 0 ? `${Math.round(f.speedKts * NM_TO_MI)} mph` : null;
  const motion = [mph, heading].filter(Boolean).join(' ');
  if (motion) parts.push(motion);
  return parts.length ? `📍 ${parts.join(' · ')}` : null;
}

function rarityLine(f: Flight): string | null {
  if (f.interestTier !== 'rare' && f.interestTier !== 'interesting') return null;
  // "Rare type: …" just names the model, which the line above already does.
  const reason = f.interestReasons.find((r) => !UNSHAREABLE_REASON.test(r) && !/^Rare type:/i.test(r));
  const label = f.interestTier === 'rare' ? '💎 Rare catch' : '⭐ Interesting catch';
  return reason ? `${label}: ${reason}` : label;
}

/** "today at 2:41 PM", "yesterday at 9:05 AM", "Oct 12 at 2:41 PM", "Oct 12, 2025". */
export function whenCaught(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  if (d.getFullYear() !== now.getFullYear()) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
}

/** The message text, ready to paste. Never includes where the user was. */
export function catchShareText(f: Flight, { mode, nearby = false, now = new Date() }: ShareOptions): string {
  const callsign = f.callsign?.trim() || null;
  const model = modelName(f);
  // What to call it in the headline, best-known identifier first.
  const name = callsign ?? f.registration ?? (model ? withArticle(model) : 'an aircraft');
  const namedByModel = !callsign && !f.registration && !!model;

  const headline =
    mode === 'caught' ? `✈️ Just caught ${name} flying over me!`
    : mode === 'live' ? `✈️ ${name[0].toUpperCase()}${name.slice(1)} is flying ${nearby ? 'near' : 'over'} me right now`
    : `✈️ Caught ${name} flying over me · ${whenCaught(f.lastSeen, now)}`;

  const about = [f.operator, namedByModel ? null : model].filter(Boolean).join(' · ');
  const reg = f.registration && f.registration !== name ? f.registration : null;
  const aircraftLine = about ? (reg ? `${about} (${reg})` : about) : reg;

  let tallyLine: string | null = null;
  if (mode === 'caught' && f.timesSeen === 1) tallyLine = '🆕 First time I’ve caught this one';
  else if (mode !== 'live' && f.timesSeen > 1) tallyLine = `🔁 I’ve caught this one ${f.timesSeen} times`;

  const lines = [headline, aircraftLine, routeLine(f), telemetryLine(f), rarityLine(f), tallyLine]
    .filter((l): l is string => !!l);
  return `${lines.join('\n')}\n\nSee what’s flying over you: ${SHARE_URL}`;
}
