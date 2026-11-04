// 设置页“版本与更新”的纯逻辑：版本号比较与 官网发布说明解析。
// 不依赖 DOM / Tamagui。

export interface ReleaseInfo {
  version: string;
  pageUrl: string;
  apkUrl: string | null;
  notes: string;
}
export interface UpdateStatus {
  currentVersion: string;
  latest: ReleaseInfo | null;
  currentRelease: ReleaseInfo | null;
}

export interface ReleaseNoteBlock {
  kind: 'heading' | 'text' | 'item';
  text: string;
}

/** 逐段比较数字版本号（0.4.10 > 0.4.9），长度不同按 0 补齐。 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** 去掉粗体、链接、行内代码等标记，只保留可读文本。 */
function inlineText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}

/**
 * 把 Release 说明（按发布规范的 Markdown）解析成设置页可渲染的段落：
 * - 跳过“Android 用户请下载这个文件”小节：应用内已有下载按钮；
 * - 跳过 “✨ vX.Y.Z 更新内容” 标题和“包含自 …”引言：界面会自行标注版本；
 * - `###` 小节标题与 `##` 系统要求保留为 heading，`-` 列表项保留为 item。
 */
export function parseReleaseNotes(markdown: string): ReleaseNoteBlock[] {
  const blocks: ReleaseNoteBlock[] = [];
  let skipping = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      const text = inlineText(heading[1]);
      skipping = text.includes('Android 用户请下载');
      // “✨ vX.Y.Z 更新内容”由界面自行标注版本，跳过原始标题
      if (!skipping && !/^✨?\s*v?\d+(\.\d+)+\s*更新内容$/.test(text)) blocks.push({ kind: 'heading', text });
      continue;
    }
    if (skipping || line.startsWith('包含自')) continue;
    const item = line.match(/^[-*]\s+(.*)$/);
    if (item) blocks.push({ kind: 'item', text: inlineText(item[1]) });
    else blocks.push({ kind: 'text', text: inlineText(line) });
  }
  return blocks;
}
