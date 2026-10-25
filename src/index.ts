import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import musicRoutes from './routes/api/music.js';
import avatarRouter from './routes/api/avatar.js';
import emojiRouter from './routes/api/emoji.js';
import adminApi from './routes/api/admin.js';
import { indexPage } from './routes/page/index.js'
import { docPage } from './routes/page/doc.js';
import { adminPage } from './routes/page/admin.js';
import { createCorsMiddleware } from './utils/middleware/cors.js';
import { counterMiddleware} from './utils/middleware/counter.js';
import { createRateLimitMiddleware } from './utils/middleware/rateLimiter.js';
import { lruCacheMiddleware } from './utils/middleware/lruCache.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

const app = new Hono()

// 全局 CORS 中间件
app.use('*', createCorsMiddleware(config.allowedOrigins));

// 静态资源（表情图片等），目录 public/ 随仓库一起发布
// serveStatic 会用完整请求路径拼接 root，因此需要先去掉 /static 前缀
app.use('/static/*', async (c, next) => {
  c.header('Cache-Control', 'public, max-age=86400');
  await next();
});
app.use('/static/*', serveStatic({
  root: './public',
  rewriteRequestPath: (path) => path.replace(/^\/static/, ''),
}));

// 接口限制流量
if(config.musicOpen) app.use('/music/*', createRateLimitMiddleware({ maxRequests: 600, windowMs: 60 * 1000 }));
if(config.avatarOpen) app.use('/avatar/*', createRateLimitMiddleware({ maxRequests: 600, windowMs: 60 * 1000 }));
if(config.emojiOpen) app.use('/emoji/*', createRateLimitMiddleware({ maxRequests: 600, windowMs: 60 * 1000 }));

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
  skipWhen: (data: any) => {
    if (Array.isArray(data)) return data.length === 0;
    if (data && typeof data === 'object' && 'name' in data && !data.name) return true;
    return false;
  }
})); // 音乐接口缓存30分钟
if(config.avatarOpen) app.use('/avatar/*', lruCacheMiddleware(60 * 10)); // 头像接口缓存10分钟
// 表情数据按请求域名生成图片绝对地址，缓存键需要带上 host，避免多域名之间串数据
if(config.emojiOpen) app.use('/emoji/*', lruCacheMiddleware(60 * 30, { varyHeaders: ['host', 'x-forwarded-host', 'x-forwarded-proto'] }));

// 首页
app.get('/', indexPage);

// 文档
app.get('/docs/:path{.+}', docPage)

// 管理后台（不在首页提供入口，需要密码登录）
app.get('/admin', adminPage);
app.route('/admin/api', adminApi);

// 挂载 API 路由
if(config.musicOpen) app.route('/music', musicRoutes);
if(config.avatarOpen) app.route('/avatar', avatarRouter);
if(config.emojiOpen) app.route('/emoji', emojiRouter);

// 错误处理
app.onError((err, c) => {
  logger.error(`${err}`);
  return c.json({ message: 'Internal Server Error' }, 500);
});

serve({
  fetch: app.fetch,
  port: config.port,
});

logger.info(`Open Service: ${config.musicOpen ? 'Music ' : ''}${config.avatarOpen ? 'Avatar ' : ''}${config.emojiOpen ? 'Emoji' : ''}`.trim());
logger.info(`Server is running on http://localhost:${config.port}`);

export default app;
