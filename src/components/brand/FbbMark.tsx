/** Female bodybuilder silhouette mark (FBB Tube). */
export default function FbbMark({
  className = "h-8 w-8",
  // kept for SiteMark API parity / favicon color overrides
  id: _id = "fbb",
  color: _color = "#FF2D7A",
}: {
  className?: string;
  id?: string;
  color?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand mark from /public
    <img
      src="/brand/fbbtube-mark.png"
      alt=""
      aria-hidden
      className={`object-contain ${className}`}
      width={40}
      height={40}
    />
  );
}
