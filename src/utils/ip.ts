import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo'
import { isIP } from 'node:net';
import { config } from './config.js';

/** 去掉 IPv4-mapped IPv6 前缀，便于和可信代理列表比较 */
const canonicalIP = (ip: string): string =>
  ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;

/** 取得 TCP 连接的对端地址；非 Node server 环境（如单元测试）返回空字符串 */
export const getSocketIP = (c: Context): string => {
  try {
    return getConnInfo(c).remote.address || '';
  } catch {
    return '';
  }
};

const isTrustedProxy = (ip: string): boolean =>
  config.trustedProxies.some((trusted) => canonicalIP(trusted) === canonicalIP(ip));

/**
 * 获取客户端真实 IP。
 *
 * 默认只返回 socket 地址，忽略所有客户端可伪造的转发头；
 * 只有显式开启 TRUST_PROXY（并可选配置 TRUSTED_PROXIES）时才解析 X-Forwarded-For。
 * 这样限流、后台登录锁定和日志不会因为伪造请求头而被绕过。
 */
export const getClientIP = (c: Context): string => {
  const socketIP = getSocketIP(c);
  const fallback = socketIP || 'Unknown';

  if (!config.trustProxy) {
    return fallback;
  }

  // 配置了可信代理列表时，只接受来自这些代理的连接
  if (config.trustedProxies.length > 0 && (!socketIP || !isTrustedProxy(socketIP))) {
    return fallback;
  }

  if (config.trustCloudflare) {
    const cloudflareIP = c.req.header('cf-connecting-ip')?.trim();
    if (cloudflareIP && isIP(cloudflareIP) !== 0) {
      return cloudflareIP;
    }
  }

  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    const chain = forwardedFor
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '' && isIP(item) !== 0);

    if (chain.length > 0) {
      if (config.trustedProxies.length === 0) {
        // 未配置代理列表时信任整条链，取最左侧（原始客户端）
        return chain[0]!;
      }

      // 从右向左跳过可信代理，第一个非可信地址就是客户端
      for (let index = chain.length - 1; index >= 0; index -= 1) {
        const candidate = chain[index]!;
        if (!isTrustedProxy(candidate)) {
          return candidate;
        }
      }

      return chain[0]!;
    }
  }

  // X-Real-IP 没有链式信息，放在 XFF 之后作为兜底，降低被单个请求头误导的风险
  const realIP = c.req.header('x-real-ip')?.split(',')[0]?.trim();
  if (realIP && isIP(realIP) !== 0) {
    return realIP;
  }

  return fallback;
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
}
