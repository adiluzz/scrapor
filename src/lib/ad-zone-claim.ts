const claimed = new Set<string>();

export function adZoneKey(kind: "juicy" | "exo", zoneId: string): string {
  return `${kind}:${zoneId}`;
}

/** One element per network zone. Juicy looks the slot up by `getElementById(zoneId)`. */
export function claimZone(key: string): boolean {
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
}

export function releaseZone(key: string) {
  claimed.delete(key);
}
