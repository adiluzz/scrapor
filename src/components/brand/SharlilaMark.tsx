/** Minimal studio mark for Sharlila. */
export default function SharlilaMark({
  className = "h-8 w-8",
  id = "sharlila",
  color = "#C4A574",
}: {
  className?: string;
  id?: string;
  color?: string;
}) {
  const grad = `sharlila-mark-${id}`;
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={grad} x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E8D4B0" />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" stroke={`url(#${grad})`} strokeWidth="2" />
      <path
        d="M10 20 C12 12 20 12 22 20"
        stroke={`url(#${grad})`}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16" cy="12" r="2.5" fill={`url(#${grad})`} />
    </svg>
  );
}
