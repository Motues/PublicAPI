import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { compress } from 'hono/compress';
import musicRoutes from './routes/api/music.js';
import avatarRouter from './routes/api/avatar.js';
import emojiRouter from './routes/api/emoji.js';
import adminApi from './routes/api/admin.js';
import { indexPage } from './routes/page/index.js'
import { docPage } from './routes/page/doc.js';
import { adminPage } from './routes/page/admin.js';
import { createCorsMiddleware } from './utils/middleware/cors.js';
import { counterMiddleware } from './utils/middleware/counter.js';
import { createRateLimitMiddleware } from './utils/middleware/rateLimiter.js';
import { lruCacheMiddleware } from './utils/middleware/lruCache.js';
import { securityHeaders } from './utils/middleware/security.js';
import { config } from './utils/config.js';
import { PUBLIC_DIR } from './utils/paths.js';
import { logger } from './utils/logger.js';

/**
 * 组装 Hono 应用。
 *
 * 不在 import 时启动 HTTP server，方便测试（app.request）和优雅退出。
 */
export const createApp = (): Hono => {
  const app = new Hono();

  // 全局安全响应头
  app.use('*', securityHeaders);

  // 压缩文本/JSON 响应（LRU 在压缩外层之前缓存未压缩内容）
  app.use('*', compress());

  // 静态资源（表情图片等），目录 public/ 随仓库一起发布
  // serveStatic 会用完整请求路径拼接 root，因此需要先去掉 /static 前缀
  app.use('/static/*', async (c, next) => {
    c.header('Cache-Control', 'public, max-age=86400');
    await next();
  });
  app.use('/static/*', serveStatic({
    root: PUBLIC_DIR,
    rewriteRequestPath: (path) => path.replace(/^\/static/, ''),
  }));

  // 健康检查：不鉴权、不进统计、不缓存
  app.get('/healthz', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
  });

  // 公开接口才挂 CORS；后台同源访问，不暴露跨域读能力
  const publicCors = createCorsMiddleware(config.allowedOrigins, config.allowAllOrigins);

  // 接口限制流量
  if(config.musicOpen) {
    app.use('/music/*', publicCors);
    app.use('/music/*', createRateLimitMiddleware({ maxRequests: 600, windowMs: 60 * 1000, scope: 'music' }));
  }
  if(config.avatarOpen) {
    app.use('/avatar/*', publicCors);
    app.use('/avatar/*', createRateLimitMiddleware({ maxRequests: 600, windowMs: 60 * 1000, scope: 'avatar' }));
  }
  if(config.emojiOpen) {
    app.use('/emoji/*', publicCors);
    app.use('/emoji/*', createRateLimitMiddleware({ maxRequests: 600, windowMs: 60 * 1000, scope: 'emoji' }));
  }

  // 接口调用量统计
  if(config.musicOpen) app.use('/music/*', counterMiddleware);
  if(config.avatarOpen) app.use('/avatar/*', counterMiddleware);
  if(config.emojiOpen) app.use('/emoji/*', counterMiddleware);

  // 表情接口允许浏览器/CDN 缓存（LRU 缓存命中时同样生效）
  if(config.emojiOpen) app.use('/emoji/*', async (c, next) => {
    c.header('Cache-Control', 'public, max-age=3600');
    await next();
  });

  //  LRU 接口缓存
  // 音乐接口：上游超时/风控会返回空数组或不含歌名的空详情，这类失败结果不缓存，
  // 避免 30 分钟内一直命中空数据（正常结果仍然缓存）
  if(config.musicOpen) app.use('/music/*', lruCacheMiddleware(60 * 30, {
    namespace: 'music',
    max: 300,
    skipWhen: (data: any) => {
      if (Array.isArray(data)) return data.length === 0;
      if (data && typeof data === 'object' && 'name' in data && !data.name) return true;
      return false;
    }
  })); // 音乐接口缓存30分钟
  if(config.avatarOpen) app.use('/avatar/*', lruCacheMiddleware(60 * 10, { namespace: 'avatar', max: 200 })); // 头像接口缓存10分钟
  // 表情数据按请求域名生成图片绝对地址，缓存键需要带上 host，避免多域名之间串数据
  if(config.emojiOpen) app.use('/emoji/*', lruCacheMiddleware(60 * 30, {
    namespace: 'emoji',
    max: 300,
    varyHeaders: ['host', 'x-forwarded-host', 'x-forwarded-proto'],
  }));

  // 首页
  app.get('/', indexPage);

  // 文档
  app.get('/docs/:path{.+}', docPage)

  // 管理后台（不在首页提供入口，需要密码登录）
  app.get('/admin', adminPage);
  app.get('/admin/', (c) => c.redirect('/admin', 308));
  app.route('/admin/api', adminApi);

  // 挂载 API 路由
  if(config.musicOpen) app.route('/music', musicRoutes);
  if(config.avatarOpen) app.route('/avatar', avatarRouter);
  if(config.emojiOpen) app.route('/emoji', emojiRouter);

  // 错误处理
  app.onError((err, c) => {
    logger.error(`${err}`, err, 'App');
    return c.json({ message: 'Internal Server Error' }, 500);
  });

  return app;
};

export default createApp;
