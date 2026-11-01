import type { Context, Next } from 'hono';
import { getClientIP } from '../ip.js';
import { logger } from '../logger.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
  limit: number;
}

/** 内存存储限流数据；上限用于防止伪造 IP 把 Map 撑爆 */
const MAX_ENTRIES = 50_000;
const rateLimitStore = new Map<string, RateLimitEntry>();

/** 丢弃过期条目 */
const pruneExpired = (now: number = Date.now()): void => {
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
};

// 每 5 分钟清理一次；unref 避免测试/脚本被定时器挂住
const cleanupTimer = setInterval(pruneExpired, 5 * 60 * 1000);
cleanupTimer.unref?.();

/**
 * 控制 Map 大小：优先淘汰最早写入的其他 key。
 * 攻击者仍可能用大量不同 key 触发淘汰，但这比无上限增长安全；
 * 关键在于默认不信任客户端转发头，正常部署下 key 不会随意变化。
 */
const ensureCapacity = (currentKey: string): void => {
  if (rateLimitStore.size <= MAX_ENTRIES) {
    return;
  }

  for (const key of rateLimitStore.keys()) {
    if (key === currentKey) {
      continue;
    }
    rateLimitStore.delete(key);
    if (rateLimitStore.size <= MAX_ENTRIES) {
      return;
    }
  }
};

/**
 * 限流中间件配置
 */
interface RateLimitOptions {
  maxRequests?: number; // 最大请求数
  windowMs?: number; // 时间窗口（毫秒）
  /** 限流作用域，不同端点使用不同 scope 就不会互相占用配额 */
  scope?: string;
  /** 自定义 key（默认按客户端 IP）；后台登录可用固定 key 做全局限流 */
  keyGenerator?: (c: Context) => string;
}

const defaultKeyGenerator = (c: Context): string => getClientIP(c);

/**
 * 创建限流中间件
 * @param options 限流配置
 * @returns Hono中间件
 */
export const createRateLimitMiddleware = (options: RateLimitOptions = {}) => {
  const {
    maxRequests = 120, // 默认120次
    windowMs = 60 * 1000, // 默认1分钟
    scope = 'default',
    keyGenerator = defaultKeyGenerator,
  } = options;

  return async (c: Context, next: Next) => {
    const now = Date.now();
    const key = `${scope}:${keyGenerator(c)}`;
    let entry = rateLimitStore.get(key);

    // 如果不存在或已过期，创建新的记录
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + windowMs,
        limit: maxRequests,
      };
    }

    // 检查是否超过限制
    if (entry.count >= maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));

      logger.warn(`Rate limit exceeded for ${scope}: ${keyGenerator(c)} (${entry.count}/${maxRequests})`, 'RateLimit');

      c.header('Retry-After', retryAfter.toString());
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());

      return c.json(
        {
          error: 'Too Many Requests',
          message: `请求过于频繁，请在 ${retryAfter} 秒后重试`,
          retryAfter: retryAfter,
        },
        429
      );
    }

    // 增加计数（命中限流时不计入，保持窗口稳定）
    entry.count++;
    rateLimitStore.set(key, entry);
    ensureCapacity(key);

    c.header('X-RateLimit-Limit', maxRequests.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count).toString());
    c.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());

    await next();
  };
};

/**
 * 获取指定IP的限流状态
 * @param ip IP地址
 * @param scope 作用域
 * @returns 限流状态信息
 */
export const getRateLimitStatus = (ip: string, scope: string = 'default') => {
  const entry = rateLimitStore.get(`${scope}:${ip}`);
  const now = Date.now();

  if (!entry || now > entry.resetTime) {
    return {
      limit: 120,
      remaining: 120,
      reset: Math.ceil((now + 60000) / 1000),
    };
  }

  return {
    limit: entry.limit,
    remaining: Math.max(0, entry.limit - entry.count),
    reset: Math.ceil(entry.resetTime / 1000),
  };
};

/**
 * 清除指定IP的限流记录
 * @param ip IP地址
 * @param scope 作用域
 */
export const clearRateLimit = (ip: string, scope?: string): void => {
  if (scope) {
    rateLimitStore.delete(`${scope}:${ip}`);
    return;
  }

  for (const key of rateLimitStore.keys()) {
    if (key.endsWith(`:${ip}`)) {
      rateLimitStore.delete(key);
    }
  }
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
