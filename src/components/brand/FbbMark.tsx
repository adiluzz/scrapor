/** Stylized female torso mark — six-pack abs + bust (FBB Tube). */
export default function FbbMark({
  className = "h-8 w-8",
  id = "fbb",
  color = "#3B82A0",
}: {
  className?: string;
  id?: string;
  color?: string;
}) {
  const grad = `fbb-mark-${id}`;
  return (
    <svg
      className={className}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={grad} x1="20" y1="2" x2="20" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7EB8CC" />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor="#1E4A5C" />
        </linearGradient>
      </defs>
      {/* Shoulders / bust */}
      <ellipse cx="12" cy="14" rx="7.5" ry="6.5" fill={`url(#${grad})`} />
      <ellipse cx="28" cy="14" rx="7.5" ry="6.5" fill={`url(#${grad})`} />
      {/* Torso */}
      <path
        d="M8 16 C8 16 10 44 20 46 C30 44 32 16 32 16 C28 22 12 22 8 16Z"
        fill={`url(#${grad})`}
      />
      {/* Cleavage hint */}
      <path d="M20 10 L20 18" stroke="#0F172A" strokeOpacity="0.25" strokeWidth="1.2" />
      {/* Six-pack */}
      <rect x="14" y="22" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.28" />
      <rect x="21" y="22" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.28" />
      <rect x="14" y="28" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.28" />
      <rect x="21" y="28" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.28" />
      <rect x="14" y="34" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.28" />
      <rect x="21" y="34" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.28" />
      {/* Highlight */}
      <ellipse cx="15" cy="12" rx="2" ry="2.5" fill="white" fillOpacity="0.3" />
    </svg>
  );
}
