/** Mirrors worker/media.py storyboard interval logic for grid sprite previews. */
export const STORYBOARD_COLS = 5;
export const STORYBOARD_TILE_W = 160;
export const STORYBOARD_TILE_H = 90;
export const STORYBOARD_MAX_TILES = 100;

export function storyboardIntervalSec(durationSec: number | null | undefined): number {
  const duration = durationSec && durationSec > 0 ? durationSec : 60;
  let interval = 10;
  while (Math.ceil(duration / interval) > STORYBOARD_MAX_TILES) interval += 5;
  return Math.min(interval, 60);
}

/** Frame tile indices to cycle on grid hover when only a storyboard sprite exists. */
export function storyboardHoverFrameIndices(
  durationSec: number | null | undefined,
  count = 8
): number[] {
  const duration = durationSec && durationSec > 0 ? durationSec : 60;
  const interval = storyboardIntervalSec(duration);
  const total = Math.max(1, Math.ceil(duration / interval));
  const pick = Math.min(count, total);
  if (pick <= 1) return [0];
  const step = total / pick;
  return Array.from({ length: pick }, (_, i) => Math.min(total - 1, Math.floor(i * step)));
}

export function storyboardRowCount(durationSec: number | null | undefined): number {
  const duration = durationSec && durationSec > 0 ? durationSec : 60;
  const interval = storyboardIntervalSec(duration);
  const count = Math.max(1, Math.ceil(duration / interval));
  return Math.ceil(count / STORYBOARD_COLS);
}
