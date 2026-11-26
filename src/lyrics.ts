export interface Lyrics {
  lrc: string;
  yrc: string;
  translation: string;
  yrcTranslation?: string;
  romanization: string;
}
export interface LyricWord {
  start: number;
  end: number;
  text: string;
}
export interface LyricLine {
  start: number;
  end: number;
  text: string;
  words: LyricWord[];
}

const LINE_SPLIT_RE = /\r?\n/;
const LRC_OFFSET_RE = /\[offset:([+-]?\d+)\]/i;
const LRC_STAMP_RE = /\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_TAG_RE = /\[[^\]]*\]/g;
const YRC_TIMING_RE = /^\[(\d+),(\d+)\]/;
const YRC_WORD_RE = /\((\d+),(\d+),\d+\)([^()]*)/g;

export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const offset = Number(source.match(LRC_OFFSET_RE)?.[1] || 0);
  for (const row of source.split(LINE_SPLIT_RE)) {
    const stamps = [...row.matchAll(LRC_STAMP_RE)];
    const text = row.replace(LRC_TAG_RE, '').trim();
    for (const stamp of stamps) {
      const start = Math.max(
        0,
        Number(stamp[1]) * 60000 + Number(stamp[2]) * 1000 + Number((stamp[3] || '').padEnd(3, '0')) + offset,
      );
      lines.push({ start, end: Infinity, text, words: [] });
    }
  }
  lines.sort((a, b) => a.start - b.start);
  lines.forEach((line, i) => {
    line.end = lines[i + 1]?.start ?? Infinity;
  });
  return lines;
}

export function parseYrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of source.split(LINE_SPLIT_RE)) {
    const timing = row.match(YRC_TIMING_RE);
    if (!timing) continue;
    const words = [...row.matchAll(YRC_WORD_RE)].map((match) => ({
      start: Number(match[1]),
      end: Number(match[1]) + Number(match[2]),
      text: match[3],
    }));
    if (words.length)
      lines.push({
        start: Number(timing[1]),
        end: Number(timing[1]) + Number(timing[2]),
        text: words.map((word) => word.text).join(''),
        words,
      });
  }
  return lines.sort((a, b) => a.start - b.start);
}

export function activeLine(lines: LyricLine[], position: number): number {
  let low = 0,
    high = lines.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (lines[mid].start <= position) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

// Keep the original and translation on the same timing track.
export function prepareLyrics(data?: Lyrics): { lines: LyricLine[]; translations: Map<number, string> } {
  const lrc = parseLrc(data?.lrc || '');
  const useLrc = lrc.some((line) => line.text);
  const lines = useLrc ? lrc : parseYrc(data?.yrc || '');
  const translation = !useLrc && data?.yrcTranslation?.trim() ? data.yrcTranslation : data?.translation || '';
  const translations = new Map<number, string>();
  for (const line of parseLrc(translation)) {
    if (!line.text) continue;
    const existing = translations.get(line.start);
    translations.set(line.start, existing ? `${existing} / ${line.text}` : line.text);
  }
  return { lines, translations };
}
