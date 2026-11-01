import type { Context } from 'hono';
import Meting from '../thirdparty/meting/meting.js';
import { LRUCache } from 'lru-cache'
import { loadMetingSettings } from '../utils/dataLoader.js';
import { logger } from '../utils/logger.js';

// Enable data formatting for consistent output
const formatMeting = (m: Meting) => { m.format(true); return m; };

const MUSIC_TYPES = ['details', 'name', 'artist', 'url', 'cover', 'lyric', 'playlist', 'search'] as const;
type MusicType = typeof MUSIC_TYPES[number];

const musicInfoCache = new LRUCache<string, string>({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24, // 缓存24小时
});

/** 上游失败负缓存，避免一次超时后 24 小时都返回 500 */
const musicFailureCache = new LRUCache<string, number>({
  max: 1000,
  ttl: 1000 * 60, // 60 秒
});

/**
 * 清空音乐信息缓存（管理后台修改 Cookie 等设置后调用）
 * @returns 被清除的歌曲详情缓存条目数量
 */
export const clearMusicInfoCache = (): number => {
  const size = musicInfoCache.size;
  musicInfoCache.clear();
  musicFailureCache.clear();
  logger.info(`Cleared ${size} cached song details`, 'Music');
  return size;
};

/** 解析有界整数，非法值回退到默认值，避免把 NaN 传给上游 */
const parseBoundedInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
};

/** 日志值去换行，避免日志注入 */
const sanitizeForLog = (value: string): string =>
  value.replace(/[\r\n\t]/g, ' ').slice(0, 200);

const parseJson = (raw: unknown): unknown => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** 从 meting.song() 的 JSON 数组里取出第一首；结构不合法时返回 null */
const extractSong = (raw: unknown): Record<string, any> | null => {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const first = parsed[0];
  return first && typeof first === 'object' && !Array.isArray(first)
    ? first as Record<string, any>
    : null;
};

export const getMusicData = async (c: Context) => {
  const server = c.req.query('server') || 'netease';
  const typeParam = c.req.query('type')?.trim() || 'details';
  const id = (c.req.query('id') ?? '').trim();
  const br = parseBoundedInt(c.req.query('br'), 320, 1, 999);
  const size = parseBoundedInt(c.req.query('size'), 300, 16, 2000);
  const limit = parseBoundedInt(c.req.query('limit'), 5, 1, 100);

  // 必填参数校验
  if (!id) {
    return c.json({ error: 'id is a required parameter' }, 400);
  }
  if (id.length > 512 || /[\u0000-\u001f\u007f]/.test(id)) {
    return c.json({ error: 'Invalid id parameter' }, 400);
  }

  if (!MUSIC_TYPES.includes(typeParam as MusicType)) {
    return c.json({ error: 'Invalid type parameter' }, 400);
  }
  const type = typeParam as MusicType;

  if (!['netease', 'tencent', 'kugou', 'baidu', 'kuwo'].includes(server)) {
    return c.json({ error: 'Invalid server parameter' }, 400);
  }

  // 每个请求创建独立的 Meting 实例，避免并发状态串扰
  const meting = formatMeting(new Meting(server));

  if (server === 'netease') {
    const settings = loadMetingSettings();
    if (settings.cookie && settings.cookie.trim() !== '') {
      meting.cookie(settings.cookie);
    }
  }

  const logId = sanitizeForLog(id);
  const cacheKey = `${server}:${id}`;
  logger.info(`Server: ${server}, Type: ${type}, ID: ${logId}`, 'Music');

  try {
    if (type === 'search' || type === 'playlist') {
      const raw = type === 'search'
        ? await meting.search(id, { limit })
        : await meting.playlist(id);
      const result = parseJson(raw);
      if (result === null) {
        logger.error(`Invalid upstream response for ${type} ${logId}`, undefined, 'Music');
        return c.json({ error: 'Upstream returned invalid data' }, 502);
      }
      return c.json(result);
    }

    // 详情缓存必须带平台：网易云/QQ 音乐的歌曲 id 都可能为纯数字
    const cachedFailure = musicFailureCache.get(cacheKey);
    if (cachedFailure) {
      return c.json({
        error: cachedFailure === 404 ? 'Song not found' : 'Upstream temporarily unavailable',
      }, cachedFailure as 404 | 502);
    }

    let details = musicInfoCache.get(cacheKey);
    let songInfo = details ? extractSong(details) : null;

    if (!songInfo) {
      // 命中但结构已损坏（旧版本缓存/上游异常）时清除并重新请求
      if (details) {
        musicInfoCache.delete(cacheKey);
      }

      details = await meting.song(id);
      songInfo = extractSong(details);

      if (!songInfo) {
        const parsed = parseJson(details);
        if (Array.isArray(parsed) && parsed.length === 0) {
          musicFailureCache.set(cacheKey, 404);
          return c.json({ error: 'Song not found' }, 404);
        }

        musicFailureCache.set(cacheKey, 502);
        logger.error(`Invalid song details for ${server}:${logId}`, undefined, 'Music');
        return c.json({ error: 'Upstream returned invalid data' }, 502);
      }

      if (typeof details === 'string') {
        musicInfoCache.set(cacheKey, details);
      }
    }

    switch (type) {
      case 'details':
        return c.json(songInfo);
      case 'name':
        return c.json({ name: songInfo.name });
      case 'artist':
        return c.json({ artist: songInfo.artist });
      case 'url': {
        const raw = await meting.url(String(songInfo.url_id ?? ''), br);
        const result = parseJson(raw);
        if (result === null) {
          musicFailureCache.set(cacheKey, 502);
          return c.json({ error: 'Upstream returned invalid data' }, 502);
        }
        return c.json(result);
      }
      case 'cover': {
        const raw = await meting.pic(String(songInfo.pic_id ?? ''), size);
        const result = parseJson(raw);
        if (result === null) {
          musicFailureCache.set(cacheKey, 502);
          return c.json({ error: 'Upstream returned invalid data' }, 502);
        }
        return c.json(result);
      }
      case 'lyric': {
        const raw = await meting.lyric(String(songInfo.lyric_id ?? ''));
        const result = parseJson(raw);
        if (result === null) {
          musicFailureCache.set(cacheKey, 502);
          return c.json({ error: 'Upstream returned invalid data' }, 502);
        }
        return c.json(result);
      }
      default:
        return c.json({ error: 'Invalid type parameter' }, 400);
    }
  } catch (error) {
    logger.error(`Internal Server Error for ${server}:${logId}:`, error, 'Music');
    musicFailureCache.set(cacheKey, 502);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
};
