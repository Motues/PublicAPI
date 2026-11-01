import { cors } from 'hono/cors';

/**
 * 公开 API 的 CORS 中间件。
 *
 * 公开接口不需要 Cookie，因此永远不开启 credentials；ALLOW_ORIGIN 留空或为 `*`
 * 时使用 `*`，配置了白名单时只回显命中白名单的 Origin。
 * 管理后台不挂载该中间件，避免同站子域带 Cookie 读取后台数据。
 */
export const createCorsMiddleware = (allowedOrigins: string[], allowAll: boolean = allowedOrigins.length === 0) => {
  const allowAnyOrigin = allowAll || allowedOrigins.includes('*');

  return cors({
    origin: allowAnyOrigin
      ? '*'
      : (origin) => (allowedOrigins.includes(origin) ? origin : ''),
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    exposeHeaders: [
      'Retry-After',
      'X-Cache',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    maxAge: 86400,
    credentials: false,
  });
};
