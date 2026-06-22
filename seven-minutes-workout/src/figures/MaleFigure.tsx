// Placeholder male silhouette. This is intentionally generic — the real
// per-exercise male animation drops in here later (keyed by `exerciseId`),
// behind the same <ExerciseFigure> seam. For now it renders a static figure.

export function MaleFigure({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 200"
      role="img"
      aria-label="Männliche Figur"
      fill="currentColor"
    >
      {/* head */}
      <circle cx="60" cy="26" r="18" />
      {/* torso — broader shoulders */}
      <path d="M30 58 Q60 48 90 58 L84 120 Q60 128 36 120 Z" />
      {/* arms */}
      <path d="M30 60 L14 110 L24 114 L40 70 Z" />
      <path d="M90 60 L106 110 L96 114 L80 70 Z" />
      {/* legs */}
      <path d="M42 118 L36 188 L50 188 L58 126 Z" />
      <path d="M78 118 L84 188 L70 188 L62 126 Z" />
    </svg>
  );
}
