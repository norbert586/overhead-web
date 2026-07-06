// Photo placeholder: when no photo exists at any tier, show a chart-style
// top-view silhouette matched to the aircraft category instead of a text
// shrug. Reads like a chart symbol, not a broken image.

import { categorize, type SilhouetteCategory } from '../utils/aircraftCategory';

interface AircraftSilhouetteProps {
  aircraftType: string | null;
  /** True while the photo waterfall is still being tried. */
  searching: boolean;
}


// Top-view silhouettes, nose up, in a 100×100 box.
function JetPath() {
  return (
    <path d="M50 6 C52 6 54 10 54 18 L54 34 L88 52 L88 58 L54 48 L54 72 L66 82 L66 87 L50 82 L34 87 L34 82 L46 72 L46 48 L12 58 L12 52 L46 34 L46 18 C46 10 48 6 50 6 Z" />
  );
}

function PropPath() {
  return (
    <>
      <path d="M50 12 C52 12 53 16 53 22 L53 34 L92 40 L92 48 L53 48 L53 70 L68 76 L68 82 L50 78 L32 82 L32 76 L47 70 L47 48 L8 48 L8 40 L47 34 L47 22 C47 16 48 12 50 12 Z" />
      {/* propeller disc */}
      <circle cx="50" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
    </>
  );
}

function HeliPath() {
  return (
    <>
      {/* main rotor */}
      <circle cx="50" cy="42" r="34" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <path d="M26 18 L74 66 M74 18 L26 66" stroke="currentColor" strokeWidth="2" opacity="0.8" fill="none" strokeLinecap="round" />
      {/* fuselage + tail boom */}
      <path d="M50 28 C57 28 61 34 61 42 C61 50 57 56 50 56 C43 56 39 50 39 42 C39 34 43 28 50 28 Z M48 56 L48 84 L44 90 L56 90 L52 84 L52 56 Z" />
    </>
  );
}

/** Bare top-view glyph, reusable anywhere (Hangar cards, placeholders). */
export function SilhouetteGlyph({ category, className = '' }: {
  category: SilhouetteCategory;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {category === 'jet'  && <JetPath />}
      {category === 'prop' && <PropPath />}
      {category === 'heli' && <HeliPath />}
    </svg>
  );
}

export default function AircraftSilhouette({ aircraftType, searching }: AircraftSilhouetteProps) {
  const category = categorize(aircraftType);

  return (
    <div className="photo-silhouette" role="img" aria-label={searching ? 'Searching photo archives' : 'No photo on file'}>
      <SilhouetteGlyph
        category={category}
        className={`photo-silhouette-glyph${searching ? ' searching' : ''}`}
      />
      {aircraftType && <div className="photo-silhouette-type">{aircraftType}</div>}
      <div className="photo-silhouette-label">
        {searching ? 'Checking photo archives…' : 'No photo on file'}
      </div>
    </div>
  );
}
