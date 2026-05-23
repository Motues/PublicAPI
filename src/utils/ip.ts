import type { Context } from 'hono';

/**
 * 获取客户端真实IP地址
 * 优先级: cf-connecting-ip > x-real-ip > x-forwarded-for > ctx.ip
 * @param c Hono上下文对象
 * @returns 客户端IP地址
 */
export const getClientIP = (c: Context): string => {
  // Cloudflare CDN IP
  const cfConnectingIP = c.req.header('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Nginx反向代理IP
  const xRealIP = c.req.header('x-real-ip');
  if (xRealIP) {
    return xRealIP;
  }

  // 负载均衡或代理转发的IP列表，取第一个
  const xForwardedFor = c.req.header('x-forwarded-for');
  if (xForwardedFor) {
    const ip = xForwardedFor.split(',')[0]?.trim();
    if (ip) {
      return ip;
    }
  }

  // 默认使用Hono提供的IP
  return 'unknown';
};
