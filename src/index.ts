import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import musicRoutes from './routes/api/music.js';
import avatarRouter from './routes/api/avatar.js';
import { indexPage } from './routes/page/index.js'
import { docPage } from './routes/page/doc.js';
import { createCorsMiddleware } from './utils/cors.js';
import { incrementCounter, getStats } from './utils/counter.js';
import { createRateLimitMiddleware } from './utils/rateLimiter.js';
import { config } from './utils/config.js';

const app = new Hono()

// 全局 CORS 中间件
app.use('*', createCorsMiddleware(config.allowedOrigins));

// 接口限制流量
if(config.musicOpen) app.use('/music/*', createRateLimitMiddleware({ maxRequests: 120, windowMs: 60 * 1000 }));
if(config.avatarOpen) app.use('/avatar/*', createRateLimitMiddleware({ maxRequests: 300, windowMs: 60 * 1000 }));

// 接口调用量统计
if(config.musicOpen) app.use('/music/*', async (c, next) => { await incrementCounter(); await next(); });
if(config.avatarOpen) app.use('/avatar/*', async (c, next) => { await incrementCounter(); await next(); });

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