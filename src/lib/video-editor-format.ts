/** Format seconds as m:ss or m:ss.d */
export function formatEditorTime(sec: number, decimals = 1): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (decimals === 0) return `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
  const whole = Math.floor(s);
  const frac = Math.floor((s - whole) * 10);
  return `${m}:${String(whole).padStart(2, "0")}.${frac}`;
}

export function formatEditorDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
