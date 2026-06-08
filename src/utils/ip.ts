import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo'

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
  return getConnInfo(c).remote.address || 'Unknown';
};

/**
 * 提取请求的根来源（去掉子路径）
 * @param c Hono 的 Context 上下文
 * @returns 格式化后的 Origin 域名或 'Direct Access'
 */
export function getRequestOrigin(c: Context): string {
  const rawReferer = c.req.header('referer') || c.req.header('origin');
  
  if (!rawReferer) {
    return 'Direct Access'
  }

  return rawReferer;


  // try {
  //   // 自动剥离请求体、子路径及末尾斜杠
  //   return new URL(rawReferer).origin
  // } catch {
  //   // 恶意攻击或非标准 URL 时安全回退
  //   return rawReferer
  // }
}