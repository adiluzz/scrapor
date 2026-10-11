import type { StudioStar } from "@/lib/studio-talent";

export default function StudioTalentGallery({ star }: { star: StudioStar }) {
  if (star.images.length === 0 && star.videos.length === 0) return null;

  return (
    <section className="border-t border-white/5 px-5 py-16 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-12">
        {star.images.length > 0 ? (
          <div>
            <p className="studio-kicker text-brand-300/80">Stills</p>
            <h2 className="font-display mt-3 text-3xl text-white sm:text-4xl">Gallery</h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {star.images.map((item) => (
                <li key={item.id} className="overflow-hidden bg-zinc-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.title || `${star.name} still`}
                    className="aspect-[3/4] w-full object-cover"
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {star.videos.length > 0 ? (
          <div>
            <p className="studio-kicker text-brand-300/80">Scenes</p>
            <h2 className="font-display mt-3 text-3xl text-white sm:text-4xl">Videos</h2>
            <ul className="mt-8 grid gap-6 lg:grid-cols-2">
              {star.videos.map((item) => (
                <li key={item.id}>
                  <video
                    src={item.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full bg-black"
                  />
                  {item.title ? (
                    <p className="mt-2 text-sm text-zinc-400">{item.title}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
