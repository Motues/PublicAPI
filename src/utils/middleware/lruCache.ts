import { LRUCache } from 'lru-cache'
import { createHash } from 'node:crypto';
import { logger } from '../logger.js';

const DEFAULT_MAX = 500;
const DEFAULT_TTL_MS = 1000 * 60 * 5;

interface CachedEntry {
  data?: unknown;
  redirect?: string;
  contentType: string;
  headers: Record<string, string>;
}

/** 每个服务独立缓存，避免音乐请求把头像/表情的缓存挤掉 */
const caches = new Map<string, LRUCache<string, CachedEntry>>();

const getCache = (namespace: string, max: number): LRUCache<string, CachedEntry> => {
  let cache = caches.get(namespace);
  if (!cache) {
    cache = new LRUCache<string, CachedEntry>({
      max,
      ttl: DEFAULT_TTL_MS,
      allowStale: false,
      updateAgeOnGet: false,
    });
    caches.set(namespace, cache);
  }
  return cache;
};

const generateKey = (url: string) => {
  return createHash('md5').update(url).digest('hex');
};

/** 只保留可安全重放的响应头，避免把 Set-Cookie 等缓存给其他请求 */
const pickCacheableHeaders = (headers: Headers): Record<string, string> => {
  const picked: Record<string, string> = {};
  for (const name of ['cache-control', 'vary', 'etag', 'last-modified']) {
    const value = headers.get(name);
    if (value) {
      picked[name] = value;
    }
  }
  return picked;
};

/**
 * 轻量化 LRU 缓存中间件
 * @param ttlSeconds 过期时间（秒），如果不传则使用默认配置
 * @param options.namespace 缓存命名空间（建议按服务区分）
 * @param options.max 该命名空间的最大条目数
 * @param options.varyHeaders 参与缓存键计算的请求头（如 host），响应同样会带上 Vary
 * @param options.skipWhen 返回 true 时跳过缓存（例如上游瞬时失败返回的空数组）
 */
export const lruCacheMiddleware = (
  ttlSeconds?: number,
  options: {
    namespace?: string;
    max?: number;
    varyHeaders?: string[];
    skipWhen?: (data: any) => boolean;
  } = {}
) => {
  const namespace = options.namespace ?? 'default';
  const max = options.max ?? DEFAULT_MAX;
  const varyHeaders = options.varyHeaders ?? [];
  const skipWhen = options.skipWhen;
  const cache = getCache(namespace, max);

  const buildKey = (c: any) => {
    const vary = varyHeaders.map((name) => `${name}=${c.req.header(name) ?? ''}`).join('&');
    return `cache:${generateKey(vary ? `${c.req.url}|${vary}` : c.req.url)}`;
  };

  return async (c: any, next: any) => {
    if (varyHeaders.length > 0) {
      c.header('Vary', varyHeaders.join(', '));
    }

    const key = buildKey(c);
    const cached = cache.get(key);

    if (cached) {
      c.header('X-Cache', 'HIT');
      for (const [name, value] of Object.entries(cached.headers)) {
        c.header(name, value);
      }

      if (cached.redirect) {
        return c.redirect(cached.redirect);
      }
      if (cached.contentType.includes('json')) {
        return c.json(cached.data);
      }
      return c.body(cached.data as string, 200, {
        'Content-Type': cached.contentType || 'image/svg+xml',
      });
    }

    await next();

    // 成功响应并缓存
    if ((c.res.status === 200 || c.res.status === 302) && c.req.method === 'GET') {
      try {
        const contentType = c.res.headers.get('Content-Type') || '';
        const redirectUrl = c.res.headers.get('Location');
        let dataToCache: unknown;

        if (redirectUrl) {
          // 重定向缓存
        } else if (contentType.includes('application/json')) {
          dataToCache = await c.res.clone().json();
        } else if (contentType.includes('image/svg+xml') || contentType.includes('text')) {
          dataToCache = await c.res.clone().text();
        }

        const hasBody = dataToCache !== undefined && dataToCache !== null && dataToCache !== '';
        if (redirectUrl || (hasBody && !(skipWhen && skipWhen(dataToCache)))) {
          cache.set(key, {
            data: dataToCache,
            redirect: redirectUrl ?? undefined,
            contentType,
            headers: pickCacheableHeaders(c.res.headers),
          }, {
            ttl: ttlSeconds ? ttlSeconds * 1000 : undefined
          });
        }
      } catch (e) {
        logger.error('Failed to cache response:', e, 'Cache');
      }
    }

    c.header('X-Cache', 'MISS');
  }
}

/**
 * 清空接口响应缓存（管理后台修改配置后调用）
 * @param namespace 只清某个命名空间；不传则清空全部
 * @returns 被清除的缓存条目数量
 */
export const clearResponseCache = (namespace?: string): number => {
  let size = 0;

  if (namespace) {
    const cache = caches.get(namespace);
    if (cache) {
      size = cache.size;
      cache.clear();
    }
  } else {
    for (const cache of caches.values()) {
      size += cache.size;
      cache.clear();
    }
  }

  logger.info(`Cleared ${size} cached responses${namespace ? ` (${namespace})` : ''}`, 'Cache');
  return size;
}
