// The mark: a plane crossing the dome of the sky — what the app watches.
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`app-logo-icon ${className}`} aria-hidden="true">
      <path className="app-logo-dome" d="M3 17.5a9 9 0 0 1 18 0" fill="none" strokeWidth="1.6" strokeLinecap="round" />
      <path className="app-logo-ground" d="M1.5 20.5h21" fill="none" strokeWidth="1.6" strokeLinecap="round" />
      <path className="app-logo-plane" transform="translate(12 13.6) rotate(72) scale(0.34) translate(-12 -12)" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}
