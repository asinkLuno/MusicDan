import { createCipheriv, createHash } from 'node:crypto';

const base = 'https://music.163.com';
// Same EAPI payload/encryption as src-tauri/src/ncm.rs::lyric_params.
function lyricParams(id) {
  const path = '/api/song/lyric/v1';
  const payload = JSON.stringify({
    id: String(id),
    cp: 'false',
    lv: '0',
    kv: '0',
    tv: '0',
    rv: '0',
    yv: '0',
    ytv: '0',
    yrv: '0',
    csrf_token: '',
  });
  const digest = createHash('md5').update(`nobody${path}use${payload}md5forencrypt`).digest('hex');
  const cipher = createCipheriv('aes-128-ecb', Buffer.from('e82ckenh8dichen8'), null);
  return Buffer.concat([cipher.update(`${path}-36cd479b6b5-${payload}-36cd479b6b5-${digest}`), cipher.final()])
    .toString('hex')
    .toUpperCase();
}
export async function request(route, query) {
  const headers = { Referer: base, 'User-Agent': 'Mozilla/5.0' };
  let url;
  let options = { headers, signal: AbortSignal.timeout(15000) };
  if (route === 'search') {
    const keyword = query.get('keyword')?.trim();
    if (!keyword || keyword.length > 200) throw new Error('无效搜索关键词');
    url = new URL('/api/search/get', base);
    url.search = new URLSearchParams({ s: keyword, type: '1', limit: '30', offset: '0' });
  } else {
    const id = query.get('songId');
    if (!/^[1-9][0-9]{0,14}$/.test(id || '')) throw new Error('无效歌曲 ID');
    if (route === 'lyrics') {
      url = new URL('https://interface3.music.163.com/eapi/song/lyric/v1');
      options = { ...options, method: 'POST', body: new URLSearchParams({ params: lyricParams(id) }) };
    } else if (route === 'comments' || route === 'count') {
      url = new URL(`/api/v1/resource/comments/R_SO_4_${id}`, base);
      url.search = new URLSearchParams({ limit: route === 'count' ? '1' : '100', offset: '0' });
      const before = query.get('beforeTime');
      if (before && !/^[0-9]{1,16}$/.test(before)) throw new Error('无效评论游标');
      if (before) url.searchParams.set('beforeTime', before);
    } else throw new Error('未知预览接口');
  }
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`网易云请求失败：HTTP ${response.status}`);
  const data = await response.json();
  if (data.code !== 200) throw new Error(`网易云接口返回错误：${data.code}`);
  return data;
}
