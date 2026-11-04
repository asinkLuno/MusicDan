const endpoint = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9229';
const preview = new URL(process.env.MUSICDAN_PREVIEW_URL || 'http://127.0.0.1:1420/?demo=creep');
const position = Number(
  process.env.MUSICDAN_SCREENSHOT_POSITION ?? (preview.searchParams.get('demo') === 'november-rain' ? 433000 : 4000),
);
if (!Number.isFinite(position) || position < 0) throw new Error('Invalid screenshot playback position');
preview.searchParams.set('position', String(position));
preview.searchParams.set('freeze', '1');
const page = preview.href;
const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(page)}`, { method: 'PUT' }).then((r) => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let nextId = 0;
const waiters = new Map();
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id && waiters.has(data.id)) {
    const { resolve, reject } = waiters.get(data.id);
    waiters.delete(data.id);
    if (data.error) reject(new Error(data.error.message));
    else resolve(data.result);
  }
};
function cdp(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    waiters.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
await cdp('Page.enable');
await cdp('Page.bringToFront');

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, label) {
  for (let i = 0; i < 300; i++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
// Portrait 19.5:9 Android screen: 432×936 CSS px, 1080×2340 output px.
await cdp('Emulation.setDeviceMetricsOverride', {
  width: 432,
  height: 936,
  screenWidth: 432,
  screenHeight: 936,
  deviceScaleFactor: 2.5,
  mobile: true,
  screenOrientation: { type: 'portraitPrimary', angle: 0 },
});
await waitFor(`!!document.querySelector('[aria-label="手动匹配"]')`, 'the application playback state');
await waitFor(
  `(() => {
  const canvas = document.querySelector('canvas');
  return canvas?.width > 0 && canvas.height > 0 && canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
})()`,
  'visible danmaku',
);
await waitFor(`!!document.querySelector('[aria-label="同步歌词"]')`, 'real lyrics');
await waitFor(`!document.body.innerText.includes('后台补充中')`, 'comment loading');
await new Promise((resolve) => setTimeout(resolve, 800));
const fs = await import('node:fs/promises');
const path = await import('node:path');
const danmakuPath = process.argv[2] || 'artifacts/previews/app-danmaku.png';
const searchPath = process.argv[3] || danmakuPath.replace(/\.png$/i, '') + '-search.png';
const fullscreenPath = process.argv[4] || danmakuPath.replace(/\.png$/i, '') + '-fullscreen.png';
async function capture(output) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const png = Buffer.from(shot.data, 'base64');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== 1080 || height !== 2340) throw new Error(`Unexpected screenshot dimensions: ${width}×${height}`);
  await fs.writeFile(output, png);
  console.log(`Saved ${output} (${width}×${height}, portrait 9:19.5)`);
}
try {
  const seconds = Math.floor(position / 1000);
  const expectedTime = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  await waitFor(
    `document.body.innerText.split('\\n').includes(${JSON.stringify(expectedTime)})`,
    'the fixed playback time',
  );
  const scenario = preview.searchParams.get('demo') || 'creep';
  const ids = await evaluate(
    `fetch('/__musicdan_preview/fixture?name=' + ${JSON.stringify(scenario)}).then(response => response.json()).then(data => data.previewSongIds || [])`,
  );
  if (ids.length > 1) {
    await evaluate(`document.querySelector('[aria-label="手动匹配"]').click()`);
    await waitFor(`document.querySelectorAll('[data-song-id]').length > 0`, 'version search results');
    const rows = await evaluate(
      `Array.from(document.querySelectorAll('[data-song-id]')).map(row => Number(row.dataset.songId))`,
    );
    for (const id of rows) {
      const selector = `[data-song-id="${id}"] [role="checkbox"]`;
      const wanted = ids.includes(id);
      const selected = await evaluate(
        `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-checked') === 'true'`,
      );
      if (wanted !== selected) {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
        await waitFor(
          `(document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-checked') === 'true') === ${wanted}`,
          'version selection',
        );
      }
    }
    if (!ids.every((id) => rows.includes(id))) throw new Error('Requested merge version is missing');
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(button => button.textContent === '应用选择').click()`,
    );
    await waitFor(`document.body.innerText.includes('已合并 ${ids.length} 首歌曲的评论')`, 'merged playback state');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await capture(danmakuPath);
  await evaluate(`document.querySelector('[aria-label="全屏弹幕"]').click()`);
  await waitFor(`!!document.querySelector('[aria-label="退出全屏"]')`, 'fullscreen mode');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await capture(fullscreenPath);
  await evaluate(`document.querySelector('[aria-label="退出全屏"]').click()`);
  await waitFor(`!!document.querySelector('[aria-label="手动匹配"]')`, 'normal mode');
  await evaluate(`document.querySelector('[aria-label="手动匹配"]').click()`);
  await waitFor(
    `document.querySelectorAll('[role="checkbox"]').length > 0 && !document.body.innerText.includes('正在搜索歌曲版本')`,
    'search results',
  );
  await waitFor(`!document.body.innerText.includes('评论数加载中')`, 'real comment counts');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await capture(searchPath);
} finally {
  socket.close();
  await fetch(`${endpoint}/json/close/${target.id}`);
}
