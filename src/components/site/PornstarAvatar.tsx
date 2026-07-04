import Image from "next/image";
import { pornstarImageUrl } from "@/lib/pornstar-image";

export default function PornstarAvatar({
  name,
  pornstar,
  size = "md",
  className = "",
}: {
  name: string;
  pornstar: { id: string; s3Image?: string | null };
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}) {
  const imageUrl = pornstarImageUrl(pornstar);
  const sizeClass =
    size === "2xl"
      ? "h-48 w-48 text-5xl sm:h-56 sm:w-56"
      : size === "xl"
        ? "h-32 w-32 text-4xl"
        : size === "lg"
          ? "h-24 w-24 text-3xl"
          : size === "sm"
            ? "h-12 w-12 text-lg"
            : "h-16 w-16 text-2xl";
  const dimClass = className.includes("h-") || className.includes("w-") ? "" : sizeClass;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-600 to-purple-600 ${dimClass} ${className}`}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt={name} fill className="object-cover" unoptimized />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
