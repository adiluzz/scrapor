/** One frame region in the storyboard sprite sheet (WebVTT #xywh cue). */
export type StoryboardCue = {
  start: number;
  end: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Parse a WebVTT storyboard index (time ranges → sprite #xywh regions). */
export function parseStoryboardVtt(text: string): StoryboardCue[] {
  const cues: StoryboardCue[] = [];
  for (const block of text.split(/\n\n+/)) {
    const lines = block.trim().split("\n");
    const timeLine = lines.find((l) => l.includes("-->"));
    const imgLine = lines.find((l) => l.includes("#xywh="));
    if (!timeLine || !imgLine) continue;
    const [a, b] = timeLine.split("-->").map((s) => s.trim());
    const toSec = (t: string) => {
      const p = t.split(":").map(parseFloat);
      return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    };
    const m = imgLine.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/);
    if (!m) continue;
    cues.push({
      start: toSec(a),
      end: toSec(b),
      x: +m[1],
      y: +m[2],
      w: +m[3],
      h: +m[4],
    });
  }
  return cues;
}
