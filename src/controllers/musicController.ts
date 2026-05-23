import type { Context } from 'hono';
import Meting from '../thirdparty/meting/meting.js';
import { LRUCache } from 'lru-cache'
import { loadMetingSettings } from '../utils/dataLoader.js';
import { logger } from '../utils/logger.js';

// Enable data formatting for consistent output
const formatMeting = (m: Meting) => { m.format(true); return m; };

const musicInfoCache = new LRUCache<string, string>({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24, // 缓存24小时
});

export const getMusicData = async (c: Context) => {
  const server = c.req.query('server') || 'netease';
  const type = c.req.query('type');
  const id = c.req.query('id');
  const br = Math.min(parseInt(c.req.query('br') || '320'), 999);
  const size = Math.min(parseInt(c.req.query('size') || '300'), 2000);
  const limit = Math.min(parseInt(c.req.query('limit') || '5'), 100);

  // 必填参数校验
  if (!id) {
    return c.json({ error: 'id is a required parameter' }, 400);
  }

  if (type && !['details', 'name', 'artist', 'url', 'cover', 'lyric', 'playlist', 'search'].includes(type)) {
    return c.json({ error: 'Invalid type parameter' }, 400);
  }

  if (server && !['netease', 'tencent', 'kugou', 'baidu', 'kuwo'].includes(server)) {
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

  logger.info(`Server: ${server}, Type: ${type}, ID: ${id}`, 'Music');

  try {
    let result;
    if (type === 'search') {
      const researchResult = await meting.search(id, { limit });
      result = JSON.parse(researchResult);
    } else if (type === 'playlist') {
      const playlistResult = await meting.playlist(id);
      result = JSON.parse(playlistResult);
    } else {

      let details;
      if (musicInfoCache.has(id)) {
        // 缓存命中
        details = musicInfoCache.get(id);
        logger.info(`Cache hit for song ID: ${id}`, 'Music');
      } else {
        // 缓存未命中
        details = await meting.song(id);
        musicInfoCache.set(id, details);
      }
      if (!details) {
        logger.error(`No details found for song ID: ${id}`, undefined, 'Music');
        return c.json({ error: 'Song not found' }, 404);
      }
      const songInfo = JSON.parse(details)[0]; // 获取第一首歌曲的信息
      switch (type) {
        case 'details':
          result = songInfo;
          break;
        case 'name':
          result = { name: songInfo.name };
          break;
        case 'artist':
          result = { artist: songInfo.artist };
          break;
        case 'url':
          result = await meting.url(songInfo.url_id, br);
          result = JSON.parse(result);
          break;
        case 'cover':
          result = await meting.pic(songInfo.pic_id, size);
          result = JSON.parse(result);
          break;
        case 'lyric':
          result = await meting.lyric(songInfo.lyric_id);
          result = JSON.parse(result);
          break;
      }
    }

    return c.json(result);

  } catch (error) {
    logger.error('Internal Server Error:', error, 'Music');
    return c.json({ error: 'Internal Server Error' }, 500);
  }
};
