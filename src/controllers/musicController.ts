import type { Context } from 'hono';
import Meting from '../thirdparty/meting/meting.js';
import { LRUCache } from 'lru-cache'
import { loadMetingSettings } from '../utils/dataLoader.js';

// Initialize with a music platform
const meting = new Meting('netease'); // 'netease', 'tencent', 'kugou', 'baidu', 'kuwo'

// Enable data formatting for consistent output
meting.format(true);

const musicInfoCache = new LRUCache<string, string>({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24, // 缓存24小时
});

export const getMusicData = async (c: Context) => {
  const server = c.req.query('server') || 'netease';
  const type = c.req.query('type');
  const id = c.req.query('id');
  const br = c.req.query('br') || '320';
  const size = c.req.query('size') || '300';
  const limit = c.req.query('limit') || '5';

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

  meting.site(server);

  if (server === 'netease') {
    const settings = loadMetingSettings();
    if (settings.cookie && settings.cookie.trim() !== '') {
      meting.cookie(settings.cookie);
      // console.log('[Music Cookie] Cookie set successfully.');
    }
  }

  console.log(`[Music Request] Server: ${server}, Type: ${type}, ID: ${id}`);

  try {
    let result;
    if (type === 'search') {
      const researchResult = await meting.search(id, { limit: parseInt(limit) });
      result = JSON.parse(researchResult);
    } else if (type === 'playlist') {
      const playlistResult = await meting.playlist(id);
      result = JSON.parse(playlistResult);
    } else {

      let details;
      if (musicInfoCache.has(id)) {
        // 缓存命中
        details = musicInfoCache.get(id);
        console.log('[Music Cache] Cache hit for song ID:', id);
      } else {
        // 缓存未命中
        details = await meting.song(id);
        musicInfoCache.set(id, details);
      }
      if (!details) {
        console.error('[Music Error] No details found for song ID:', id);
        return c.json({ error: 'Song not found' }, 404);
      }
      const songInfo = JSON.parse(details)[0]; // 获取第一首歌曲的信息
      // console.log('Song Info:', songInfo);
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
          result = await meting.url(songInfo.url_id, parseInt(br));
          result = JSON.parse(result);
          break;
        case 'cover':
          result = await meting.pic(songInfo.pic_id, parseInt(size));
          result = JSON.parse(result);
          break;
        case 'lyric':
          result = await meting.lyric(songInfo.lyric_id);
          result = JSON.parse(result);
          break;
      }
    }

    // console.log('Result:', result); // 输出结果以供调试
    return c.json(result);

  } catch (error) {
    console.error('[Music Error] Internal Server Error:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
};