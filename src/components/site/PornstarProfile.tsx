import type { Pornstar } from "@prisma/client";
import {
  hasTpdbProfile,
  pornstarProfileFields,
  type PornstarProfileData,
} from "@/lib/pornstar-profile";

export default function PornstarProfile({ star }: { star: PornstarProfileData & Pick<Pornstar, "bio"> }) {
  const fields = pornstarProfileFields(star);

  if (!star.bio && fields.length === 0 && !hasTpdbProfile(star)) return null;

  return (
    <div className="mt-3 space-y-3">
      {fields.length > 0 && (
        <dl className="grid max-w-2xl gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-zinc-500">{f.label}</dt>
              <dd className="text-zinc-300">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {hasTpdbProfile(star) && (
        <p className="text-xs text-zinc-600">
          Profile data from{" "}
          <a
            href={star.tpdbId ? `https://theporndb.net/performers/${star.tpdbId}` : "https://theporndb.net"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-brand-400"
          >
            ThePornDB
          </a>
          {star.tpdbSyncedAt && (
            <> · synced {new Date(star.tpdbSyncedAt).toLocaleDateString()}</>
          )}
        </p>
      )}
    </div>
  );
}
