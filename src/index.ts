import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import musicRoutes from './routes/api/music.js';
import avatarRouter from './routes/api/avatar.js';
import { indexPage } from './routes/page/index.js'
import { docPage } from './routes/page/doc.js';
import { createCorsMiddleware } from './utils/middleware/cors.js';
import { counterMiddleware} from './utils/middleware/counter.js';
import { createRateLimitMiddleware } from './utils/middleware/rateLimiter.js';
import { lruCacheMiddleware } from './utils/middleware/lruCache.js';
import { config } from './utils/config.js';

const app = new Hono()

// 全局 CORS 中间件
app.use('*', createCorsMiddleware(config.allowedOrigins));

// 接口限制流量
if(config.musicOpen) app.use('/music/*', createRateLimitMiddleware({ maxRequests: 600, windowMs: 60 * 1000 }));
if(config.avatarOpen) app.use('/avatar/*', createRateLimitMiddleware({ maxRequests: 600, windowMs: 60 * 1000 }));

// 接口调用量统计
if(config.musicOpen) app.use('/music/*', counterMiddleware);
if(config.avatarOpen) app.use('/avatar/*', counterMiddleware);

//  LRU 接口缓存
if(config.musicOpen) app.use('/music/*', lruCacheMiddleware(300));
if(config.avatarOpen) app.use('/avatar/*', lruCacheMiddleware(300));

// 首页
app.get('/', indexPage);

// 文档
app.get('/docs/:path{.+}', docPage)

// 挂载 API 路由
if(config.musicOpen) app.route('/music', musicRoutes);
if(config.avatarOpen) app.route('/avatar', avatarRouter);

// 错误处理
app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ message: 'Internal Server Error' }, 500);
});

serve({
  fetch: app.fetch,
  port: config.port,
});

console.log(`Open Service: ${config.musicOpen ? 'Music' : ''} ${config.avatarOpen ? 'Avatar' : ''}`)
console.log(`Server is running on http://localhost:${config.port}`);

export default app;