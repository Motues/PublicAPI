import type { Context, Next } from 'hono';
import { getClientIP } from '../ip.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// 内存存储限流数据
const rateLimitStore = new Map<string, RateLimitEntry>();

// 清理过期数据的定时器（每5分钟清理一次）
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * 限流中间件配置
 */
interface RateLimitOptions {
  maxRequests?: number; // 最大请求数
  windowMs?: number; // 时间窗口（毫秒）
}

/**
 * 创建限流中间件
 * @param options 限流配置
 * @returns Hono中间件
 */
export const createRateLimitMiddleware = (options: RateLimitOptions = {}) => {
  const {
    maxRequests = 120, // 默认120次
    windowMs = 60 * 1000, // 默认1分钟
  } = options;

  return async (c: Context, next: Next) => {
    const clientIP = getClientIP(c);
    
    // 跳过本地测试环境
    if (clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === 'localhost') {
      await next();
      return;
    }

    const now = Date.now();
    let entry = rateLimitStore.get(clientIP);

    // 如果不存在或已过期，创建新的记录
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(clientIP, entry);
      
      // 设置响应头
      // c.header('X-RateLimit-Limit', maxRequests.toString());
      // c.header('X-RateLimit-Remaining', (maxRequests - 1).toString());
      // c.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
      
      await next();
      return;
    }

    // 检查是否超过限制
    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      // c.header('X-RateLimit-Limit', maxRequests.toString());
      // c.header('X-RateLimit-Remaining', '0');
      // c.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
      c.header('Retry-After', retryAfter.toString());
      
      return c.json(
        {
          error: 'Too Many Requests',
          message: `请求过于频繁，请在 ${retryAfter} 秒后重试`,
          retryAfter: retryAfter,
        },
        429
      );
    }

    // 增加计数
    entry.count++;
    rateLimitStore.set(clientIP, entry);

    // 设置响应头
    // c.header('X-RateLimit-Limit', maxRequests.toString());
    // c.header('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
    // c.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());

    await next();
  };
};

/**
 * 获取指定IP的限流状态
 * @param ip IP地址
 * @returns 限流状态信息
 */
export const getRateLimitStatus = (ip: string) => {
  const entry = rateLimitStore.get(ip);
  const now = Date.now();

  if (!entry || now > entry.resetTime) {
    return {
      limit: 120,
      remaining: 120,
      reset: Math.ceil((now + 60000) / 1000),
    };
  }

  return {
    limit: 120,
    remaining: Math.max(0, 120 - entry.count),
    reset: Math.ceil(entry.resetTime / 1000),
  };
};

/**
 * 清除指定IP的限流记录
 * @param ip IP地址
 */
export const clearRateLimit = (ip: string) => {
  rateLimitStore.delete(ip);
};

/**
 * 获取所有限流记录的统计信息
 * @returns 统计信息
 */
export const getRateLimitStats = () => {
  return {
    totalIPs: rateLimitStore.size,
    activeIPs: Array.from(rateLimitStore.values()).filter(
      (entry) => Date.now() <= entry.resetTime
    ).length,
  };
};