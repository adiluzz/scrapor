import Image from "next/image";
import type { StudioStar } from "@/lib/studio-talent";

export default function StudioPortrait({
  star,
  className = "",
  priority = false,
  sizes = "(min-width: 1024px) 28vw, (min-width: 640px) 45vw, 100vw",
}: {
  star: StudioStar;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div className={`absolute inset-0 overflow-hidden bg-zinc-950 ${className}`}>
      <div className="absolute inset-0" style={{ background: star.grade }} />
      {star.photo ? (
        <Image
          src={star.photo}
          alt={star.name}
          fill
          priority={priority}
          sizes={sizes}
          unoptimized={star.photo.startsWith("/media/")}
          className="object-cover object-[center_30%] transition duration-700 ease-out group-hover:scale-[1.04]"
        />
      ) : null}
      <div className="studio-grain pointer-events-none absolute inset-0 opacity-10 mix-blend-soft-light" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
    </div>
  );
}
