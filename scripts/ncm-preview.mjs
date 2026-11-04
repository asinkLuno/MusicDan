import { readFile } from 'node:fs/promises';

// The preview is deliberately offline. Network access lives only in the explicit
// refresh script, so restarting Vite or taking another screenshot never refreshes data.
const fixtures = {
  creep: new URL('../tests/fixtures/ncm-creep.json', import.meta.url),
  'november-rain': new URL('../tests/fixtures/ncm-november-rain.json', import.meta.url),
};
export function ncmPreview() {
  return {
    name: 'musicdan-ncm-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/__musicdan_preview/fixture') return next();
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const name = url.searchParams.get('name') || 'creep';
        if (!Object.hasOwn(fixtures, name)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: '未知截图场景' }));
          return;
        }
        readFile(fixtures[name], 'utf8')
          .then((data) => res.end(data))
          .catch(() => {
            res.statusCode = 503;
            res.end(JSON.stringify({ error: '缺少测试数据，请先运行 yarn fixtures:refresh' }));
          });
      });
    },
  };
}
