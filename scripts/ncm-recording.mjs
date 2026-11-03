import { request } from './ncm-client.mjs';

export async function recordComments(songId) {
  const collected = new Map();
let beforeTime;
let total;
for (let page = 0; page < 10 && collected.size < 1000; page++) {
  const data = await request('comments', new URLSearchParams({ songId: String(songId), ...(beforeTime ? { beforeTime: String(beforeTime) } : {}) }));
  total ??= data.total;
  for (const item of [...(page === 0 ? data.hotComments || [] : []), ...data.comments]) {
    if (item.commentId && item.content.trim() && !collected.has(item.commentId)) collected.set(item.commentId, { commentId: item.commentId, content: item.content, liked_count: item.likedCount, time: item.time });
  }
  const next = Math.min(...data.comments.map(item => item.time));
  if (!data.more || !data.comments.length || !Number.isFinite(next) || next === beforeTime) break;
  beforeTime = next;
}

  return { comments: [...collected.values()].sort((a,b) => b.liked_count-a.liked_count).slice(0,1000), total };
}

export async function recordLyrics(songId, position) {
  const data = await request('lyrics', new URLSearchParams({ songId: String(songId) }));
  const timedRows = source => (source || '').split(/\r?\n/).map(row => {
    const match = row.match(/^\[(\d+):(\d+)(?:[.:](\d+))?\]/);
    if (!match) return null;
    return {
      row, stamp: match[0],
      time: Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number((match[3] || '').padEnd(3, '0')),
      text: row.slice(match[0].length).trim(),
    };
  }).filter(Boolean);
  const rows = timedRows(data.lrc?.lyric);
  let current = rows.findLastIndex(row => row.time <= position && row.text);
  if (current < 0) current = rows.findIndex(row => row.text);
  if (current < 0 || rows[current].text.split(/\s+/).length > 10) throw new Error('未找到适合测试的短歌词片段，保留旧 fixture');
  // Keep one short bilingual pair, with its original timing and boundaries.
  const preceding = current > 0 ? rows[current - 1].stamp : '[00:00.000]';
  const nextStamp = rows[current + 1]?.stamp;
  const lrc = [preceding, rows[current].row, ...(nextStamp ? [nextStamp] : [])].join('\n') + '\n';
  const translated = timedRows(data.tlyric?.lyric).find(row => row.time === rows[current].time && row.text);
  return { lrc, yrc: '', translation: translated ? translated.row + '\n' : '', romanization: '' };
}
