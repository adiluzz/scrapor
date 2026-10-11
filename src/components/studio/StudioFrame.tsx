export default function StudioFrame({
  children,
  className = "",
  wide = false,
}: {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`mx-auto w-full px-5 py-12 sm:px-8 sm:py-16 lg:px-12 ${
        wide ? "max-w-7xl" : "max-w-6xl"
      } ${className}`}
    >
      {children}
    </div>
  );
}
