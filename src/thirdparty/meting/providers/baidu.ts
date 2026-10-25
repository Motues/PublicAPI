import crypto from 'crypto';
import BaseProvider from './base.js';
import type { ApiConfig, SearchOption } from './base.js';

/**
 * 千千音乐（原百度音乐）开放接口常量
 *
 * 旧接口 musicapi.taihe.com 已下线，/v1/restserver/ting 也已 404，
 * 现改用千千音乐 Web 客户端使用的 api-qianqian.91q.com REST 接口，
 * 所有请求都需要 appid + timestamp + sign 签名。
 */
const QIANQIAN_BASE = 'https://api-qianqian.91q.com';
const QIANQIAN_APPID = '16073360';
const QIANQIAN_SECRET = '0b50b02fd0d73a9c4c8c3a781c30845f';

/**
 * 百度音乐平台提供者
 */
export default class BaiduProvider extends BaseProvider {
  constructor(meting: any) {
    super(meting);
    this.name = 'baidu';
  }

  /**
   * 获取百度音乐的请求头配置
   */
  getHeaders(): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://music.91q.com/'
    };
  }

  /**
   * 搜索歌曲
   */
  search(keyword: string, option: SearchOption = {}): ApiConfig {
    return {
      method: 'GET',
      url: `${QIANQIAN_BASE}/v1/search`,
      body: {
        word: keyword,
        type: option.type || 1,
        pageNo: option.page || 1,
        pageSize: option.limit || 30
      },
      encode: 'baidu_sign',
      format: 'data.typeTrack'
    };
  }

  /**
   * 获取歌曲详情
   */
  song(id: string): ApiConfig {
    return {
      method: 'GET',
      url: `${QIANQIAN_BASE}/v1/song/info`,
      body: { TSID: id },
      encode: 'baidu_sign',
      format: 'data'
    };
  }

  /**
   * 获取专辑信息
   */
  album(id: string): ApiConfig {
    return {
      method: 'GET',
      url: `${QIANQIAN_BASE}/v1/album/info`,
      body: { albumAssetCode: id },
      encode: 'baidu_sign',
      format: 'data.trackList'
    };
  }

  /**
   * 获取艺术家作品
   */
  artist(id: string, limit: number = 50): ApiConfig {
    return {
      method: 'GET',
      url: `${QIANQIAN_BASE}/v1/artist/songs`,
      body: {
        artistCode: id,
        pageNo: 1,
        pageSize: limit
      },
      encode: 'baidu_sign',
      format: 'data.result'
    };
  }

  /**
   * 获取播放列表
   */
  playlist(id: string): ApiConfig {
    return {
      method: 'GET',
      url: `${QIANQIAN_BASE}/v1/tracklist/info`,
      body: {
        id: id,
        pageNo: 1,
        pageSize: 1000
      },
      encode: 'baidu_sign',
      format: 'data.trackList'
    };
  }

  /**
   * 获取音频播放链接
   * rate 取值 64 / 128 / 320 / 3000
   */
  url(id: string, br: number = 320): ApiConfig {
    return {
      method: 'GET',
      url: `${QIANQIAN_BASE}/v1/song/tracklink`,
      body: {
        TSID: id,
        rate: this.pickRate(br)
      },
      encode: 'baidu_sign',
      decode: 'baidu_url'
    };
  }

  /**
   * 获取歌词
   * 千千音乐的歌词是 song/info 里返回的一个 .lrc 地址
   */
  lyric(id: string): ApiConfig {
    return {
      method: 'GET',
      url: `${QIANQIAN_BASE}/v1/song/info`,
      body: { TSID: id },
      encode: 'baidu_sign',
      decode: 'baidu_lyric'
    };
  }

  /**
   * 获取封面图片
   */
  async pic(id: string, size: number = 300): Promise<string> {
    try {
      const format = this.meting.isFormat;
      const raw = await this.meting.format(false).song(id);
      this.meting.isFormat = format;
      const data = JSON.parse(raw);
      const track = Array.isArray(data?.data) ? data.data[0] : data?.data;
      return JSON.stringify({ url: track?.pic || '' });
    } catch (e) {
      return JSON.stringify({ url: '' });
    }
  }

  /**
   * 格式化千千音乐数据
   */
  format(data: any): any {
    if (!data || typeof data !== 'object') {
      return { id: '', name: '', artist: [], album: '', pic_id: '', url_id: '', lyric_id: '', source: 'baidu' };
    }

    // 专辑 trackList 里的曲目用 assetId 而不是 TSID
    const id = data.TSID || data.assetId || data.id || '';

    return {
      id: id,
      name: data.title || data.name || '',
      artist: Array.isArray(data.artist) ? data.artist.map((a: any) => a.name) : [],
      album: data.albumTitle || '',
      pic_id: id,
      url_id: id,
      lyric_id: id,
      source: 'baidu'
    };
  }

  /**
   * 处理编码逻辑（签名）
   */
  async handleEncode(api: ApiConfig): Promise<ApiConfig> {
    if (api.encode === 'baidu_sign') {
      return this.signRequest(api);
    }
    return api;
  }

  /**
   * 千千音乐请求签名
   * sign = md5(按 key 排序后的 "k=v" 用 & 拼接 + secret)
   * 参与签名的参数 = 业务参数 + appid + timestamp
   */
  signRequest(api: ApiConfig): ApiConfig {
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, any> = {
      ...(api.body as Record<string, any>),
      appid: QIANQIAN_APPID,
      timestamp: timestamp
    };

    const raw = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    params.sign = crypto.createHash('md5').update(`${raw}${QIANQIAN_SECRET}`).digest('hex');
    api.body = params;

    return api;
  }

  /**
   * 处理解码逻辑
   */
  async handleDecode(decodeType: string, data: string): Promise<string> {
    if (decodeType === 'baidu_url') {
      return this.urlDecode(data);
    } else if (decodeType === 'baidu_lyric') {
      return await this.lyricDecode(data);
    }
    return data;
  }

  /**
   * 千千音乐 URL 解码
   */
  async urlDecode(result: string): Promise<string> {
    try {
      const json = JSON.parse(result);
      const data = json?.data;
      if (data && data.path) {
        return JSON.stringify({
          url: data.path,
          size: data.size || 0,
          br: data.rate || -1
        });
      }
    } catch (e) {
      // ignore
    }

    return JSON.stringify({ url: '', size: 0, br: -1 });
  }

  /**
   * 千千音乐歌词解码：取 song/info 返回的 lyric 地址再下载 LRC
   */
  async lyricDecode(result: string): Promise<string> {
    let lyricUrl = '';
    try {
      const json = JSON.parse(result);
      const track = Array.isArray(json?.data) ? json.data[0] : json?.data;
      lyricUrl = track?.lyric || '';
    } catch (e) {
      lyricUrl = '';
    }

    if (!lyricUrl) {
      return JSON.stringify({ lyric: '', tlyric: '' });
    }

    const lyric = await this.meting._exec({
      method: 'GET',
      url: lyricUrl,
      body: null
    });

    return JSON.stringify({ lyric: lyric || '', tlyric: '' });
  }

  /**
   * 码率映射：千千音乐只接受 64 / 128 / 320 / 3000
   */
  pickRate(br: number): number {
    if (br >= 999) return 3000;
    if (br >= 320) return 320;
    if (br >= 128) return 128;
    return 64;
  }
}
