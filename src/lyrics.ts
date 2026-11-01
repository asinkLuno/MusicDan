export interface Lyrics { lrc: string; yrc: string; translation: string; romanization: string }
export interface LyricWord { start: number; end: number; text: string }
export interface LyricLine { start: number; end: number; text: string; words: LyricWord[] }

export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0);
  for (const row of source.split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const text = row.replace(/\[[^\]]*\]/g, '').trim();
    for (const stamp of stamps) {
      const start = Math.max(0, Number(stamp[1]) * 60000 + Number(stamp[2]) * 1000 + Number((stamp[3] || '').padEnd(3, '0')) + offset);
      lines.push({ start, end: Infinity, text, words: [] });
    }
  }
  lines.sort((a, b) => a.start - b.start);
  lines.forEach((line, i) => { line.end = lines[i + 1]?.start ?? Infinity; });
  return lines;
}

export function parseYrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of source.split(/\r?\n/)) {
    const timing = row.match(/^\[(\d+),(\d+)\]/);
    if (!timing) continue;
    const words = [...row.matchAll(/\((\d+),(\d+),\d+\)([^()]*)/g)].map(match => ({ start: Number(match[1]), end: Number(match[1]) + Number(match[2]), text: match[3] }));
    if (words.length) lines.push({ start: Number(timing[1]), end: Number(timing[1]) + Number(timing[2]), text: words.map(word => word.text).join(''), words });
  }
  return lines.sort((a, b) => a.start - b.start);
}

export function activeLine(lines: LyricLine[], position: number): number {
  let low = 0, high = lines.length;
  while (low < high) { const mid = (low + high) >>> 1; if (lines[mid].start <= position) low = mid + 1; else high = mid; }
  return low - 1;
}
