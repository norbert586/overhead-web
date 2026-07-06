// Small chart-style arrow showing which way an aircraft is tracking.
// Rotates to the heading; 0° = north/up, matching compass bearings.

interface HeadingArrowProps {
  deg: number;
  className?: string;
}

export default function HeadingArrow({ deg, className = '' }: HeadingArrowProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`heading-arrow ${className}`}
      style={{ transform: `rotate(${Math.round(deg)}deg)` }}
      aria-hidden
    >
      <path d="M6 1 L9.2 9.6 L6 7.6 L2.8 9.6 Z" fill="currentColor" />
    </svg>
  );
}
