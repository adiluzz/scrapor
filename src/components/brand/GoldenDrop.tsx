/** Golden teardrop mark — shared by Logo and favicon. */
export default function GoldenDrop({
  className = "h-8 w-8",
  id = "gold",
}: {
  className?: string;
  /** Unique gradient id when multiple drops render on one page. */
  id?: string;
}) {
  const grad = `golden-drop-${id}`;
  return (
    <svg
      className={className}
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={grad} x1="16" y1="2" x2="16" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5E6A3" />
          <stop offset="45%" stopColor="#E8C547" />
          <stop offset="100%" stopColor="#C9A227" />
        </linearGradient>
        <filter id={`${grad}-shine`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#D4AF37" floodOpacity="0.55" />
        </filter>
      </defs>
      <path
        d="M16 3.5C16 3.5 6.5 18.5 6.5 26.5C6.5 32.47 10.75 37 16 37C21.25 37 25.5 32.47 25.5 26.5C25.5 18.5 16 3.5 16 3.5Z"
        fill={`url(#${grad})`}
        filter={`url(#${grad}-shine)`}
      />
      <ellipse cx="13" cy="14" rx="2.2" ry="3.5" fill="white" fillOpacity="0.35" />
    </svg>
  );
}
