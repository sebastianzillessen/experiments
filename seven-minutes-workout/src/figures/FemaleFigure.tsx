// Placeholder female silhouette. Like MaleFigure, this is the seam where the
// real per-exercise female animation drops in later (keyed by `exerciseId`).

export function FemaleFigure({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 200"
      role="img"
      aria-label="Weibliche Figur"
      fill="currentColor"
    >
      {/* head */}
      <circle cx="60" cy="26" r="17" />
      {/* torso — tapered waist into an A-line */}
      <path d="M36 56 Q60 48 84 56 L74 96 L92 150 Q60 162 28 150 L46 96 Z" />
      {/* arms */}
      <path d="M36 58 L20 108 L30 112 L46 70 Z" />
      <path d="M84 58 L100 108 L90 112 L74 70 Z" />
      {/* legs */}
      <path d="M48 150 L42 190 L54 190 L60 156 Z" />
      <path d="M72 150 L78 190 L66 190 L60 156 Z" />
    </svg>
  );
}
