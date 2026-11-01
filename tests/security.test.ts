import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { Hono } from 'hono';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'publicapi-test-'));
process.env.ADMIN_SETUP_TOKEN = 'test-setup-token';
process.env.ADMIN_SESSION_TTL = '999999';
process.env.LOG_LEVEL = 'error';
process.env.ALLOW_ORIGIN = '';

const { jsonForScript } = await import('../src/utils/html.ts');
const { verifySetupToken, getSessionTtlMinutes } = await import('../src/utils/adminAuth.ts');
const { saveServices, saveEmojiData, loadServices, getMetingCookieStatus } = await import('../src/utils/dataLoader.ts');
const { createCorsMiddleware } = await import('../src/utils/middleware/cors.ts');
const { createRateLimitMiddleware } = await import('../src/utils/middleware/rateLimiter.ts');
const { lruCacheMiddleware } = await import('../src/utils/middleware/lruCache.ts');
const { shutdownStats } = await import('../src/utils/middleware/counter.ts');

test('jsonForScript 转义 </script> 且仍是合法 JSON', () => {
  const value = ['</script><script>alert(1)</script>', 'a&b'];
  const encoded = jsonForScript(value);
  assert.equal(encoded.includes('</script>'), false);
  assert.equal(encoded.includes('\\u003c'), true);
  assert.deepEqual(JSON.parse(encoded), value);
});

test('setup token 与 session TTL', () => {
  assert.equal(verifySetupToken('test-setup-token'), true);
  assert.equal(verifySetupToken('wrong'), false);
  assert.equal(verifySetupToken(''), false);
  assert.equal(getSessionTtlMinutes(), 10080);
});

test('公开 CORS 不使用 credentials', async () => {
  const app = new Hono();
  app.use('/music/*', createCorsMiddleware([]));
  app.get('/music/a', (c) => c.json({ ok: true }));

  const res = await app.request('/music/a', { headers: { origin: 'https://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('access-control-allow-credentials'), null);
});

test('限流默认不信任 X-Forwarded-For', async () => {
  const app = new Hono();
  app.use('*', createRateLimitMiddleware({ maxRequests: 2, windowMs: 60_000, scope: 'test' }));
  app.get('/', (c) => c.text('ok'));

  const statuses: number[] = [];
  for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
    statuses.push((await app.request('/', { headers: { 'x-forwarded-for': ip } })).status);
  }
  assert.deepEqual(statuses, [200, 200, 429]);
});

test('LRU 命中保留 Cache-Control', async () => {
  const app = new Hono();
  app.use('*', lruCacheMiddleware(600, { namespace: 'test-cache', max: 10 }));
  app.get('/', (c) => {
    c.header('Cache-Control', 'public, max-age=86400');
    return c.body('<svg></svg>', 200, { 'Content-Type': 'image/svg+xml' });
  });

  const first = await app.request('/');
  const second = await app.request('/');
  assert.equal(first.headers.get('cache-control'), 'public, max-age=86400');
  assert.equal(second.headers.get('x-cache'), 'HIT');
  assert.equal(second.headers.get('cache-control'), 'public, max-age=86400');
});

test('服务目录拒绝危险链接，读取时过滤坏数据', () => {
  assert.throws(() => saveServices([{ name: 'x', url: 'javascript:alert(1)', status: 'open' }]));
  assert.throws(() => saveServices([{ name: 'x', url: '/\\evil.example/x', status: 'open' }]));

  const valid = saveServices([{ name: 'ok', url: 'https://example.com', status: 'open' }]);
  assert.equal(valid[0].url, 'https://example.com');
  assert.equal(loadServices()[0].name, 'ok');
});

test('表情分组拒绝原型保留字', () => {
  assert.throws(() => saveEmojiData(JSON.parse('{"__proto__":{"type":"emoji","container":[]}}')));
  assert.throws(() => saveEmojiData(JSON.parse('{"constructor":{"type":"emoji","container":[]}}')));
});

test('Cookie 状态只返回末 4 位', () => {
  const status = getMetingCookieStatus({ cookie: 'MUSIC_U=abcdefgh' });
  assert.equal(status.cookieConfigured, true);
  assert.equal(status.cookiePreview, '…efgh');
});

test('createApp 工厂提供健康检查', async () => {
  const { createApp } = await import('../src/app.ts');
  const app = createApp();
  const res = await app.request('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json() as { status: string; uptimeSeconds: number };
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.uptimeSeconds, 'number');
});

after(async () => {
  await shutdownStats();
});
