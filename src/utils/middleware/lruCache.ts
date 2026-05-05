import { LRUCache } from 'lru-cache'
import { createHash } from 'node:crypto';

const cacheOptions = {
  max: 500,  // 最大数量
  
  ttl: 1000 * 60 * 5, // 默认过期时间 (毫秒)

  allowStale: false, // 是否允许使用过期的条目

  updateAgeOnGet: false, // 更新条目时是否更新其过期时间
}

const localCache = new LRUCache<string, any>(cacheOptions)

const generateKey = (url: string) => {
  return createHash('md5').update(url).digest('hex');
}

/**
 * 轻量化 LRU 缓存中间件
 * @param ttlSeconds 过期时间（秒），如果不传则使用默认配置
 */
export const lruCacheMiddleware = (ttlSeconds?: number) => {
  return async (c: any, next: any) => {

    const key = `cache:${generateKey(c.req.url)}`;
    
    const cached = localCache.get(key);
    if (cached) {
      c.header('X-Cache', 'HIT');
      console.log('[Cache hit] ', key);
      if (cached?.__isRedirect) {
        return c.redirect(cached.url);
      }
      return typeof cached === 'string' 
        ? c.body(cached, 200, { 'Content-Type': 'image/svg+xml' }) 
        : c.json(cached);
    }

    await next();

    // 成功响应并缓存
    if ((c.res.status === 200 || c.res.status === 302) && c.req.method === 'GET') {
      try {
        const contentType = c.res.headers.get('Content-Type') || '';
        const redirectUrl = c.res.headers.get('Location');
        let dataToCache;

        if (redirectUrl) {
          // 重定向缓存
          dataToCache = { __isRedirect: true, url: redirectUrl };
        } else if (contentType.includes('application/json')) {
          // 普通 JSON 接口
          dataToCache = await c.res.clone().json();
        } else if (contentType.includes('image/svg+xml') || contentType.includes('text')) {
          // 头像 SVG 文本
          dataToCache = await c.res.clone().text();
        }

        if (dataToCache) {
          localCache.set(key, dataToCache, {
            ttl: ttlSeconds ? ttlSeconds * 1000 : undefined
          });
        }
      } catch (e) {
        console.error('Failed to cache response:', e);
      }
    }
    
    c.header('X-Cache', 'MISS');
  }
}