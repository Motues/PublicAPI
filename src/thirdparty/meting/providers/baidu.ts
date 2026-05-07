import crypto from 'crypto';
import BaseProvider from './base.js';
import type { ApiConfig, SearchOption } from './base.js';

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
      'Cookie': `BAIDUID=${this._getRandomHex(32)}:FG=1`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) baidu-music/1.2.1 Chrome/66.0.3359.181 Electron/3.0.5 Safari/537.36',
      'Accept': '*/*',
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept-Language': 'zh-CN'
    };
  }

  /**
   * 搜索歌曲
   */
  search(keyword: string, option: SearchOption = {}): ApiConfig {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.search.merge',
        isNew: 1,
        platform: 'darwin',
        page_no: option.page || 1,
        query: keyword,
        version: '11.2.1',
        page_size: option.limit || 30
      },
      format: 'result.song_info.song_list'
    };
  }

  /**
   * 获取歌曲详情
   */
  song(id: string): ApiConfig {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.song.getInfos',
        songid: id,
        res: 1,
        platform: 'darwin',
        version: '1.0.0'
      },
      encode: 'baidu_AESCBC',
      format: 'songinfo'
    };
  }

  /**
   * 获取专辑信息
   */
  album(id: string): ApiConfig {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.album.getAlbumInfo',
        album_id: id,
        platform: 'darwin',
        version: '11.2.1'
      },
      format: 'songlist'
    };
  }

  /**
   * 获取艺术家作品
   */
  artist(id: string, limit: number = 50): ApiConfig {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.artist.getSongList',
        artistid: id,
        limits: limit,
        platform: 'darwin',
        offset: 0,
        tinguid: 0,
        version: '11.2.1'
      },
      format: 'songlist'
    };
  }

  /**
   * 获取播放列表
   */
  playlist(id: string): ApiConfig {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.diy.gedanInfo',
        listid: id,
        platform: 'darwin',
        version: '11.2.1'
      },
      format: 'content'
    };
  }

  /**
   * 获取音频播放链接
   */
  url(id: string, br: number = 320): ApiConfig {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.song.getInfos',
        songid: id,
        res: 1,
        platform: 'darwin',
        version: '1.0.0'
      },
      encode: 'baidu_AESCBC',
      decode: 'baidu_url'
    };
  }

  /**
   * 获取歌词
   */
  lyric(id: string): ApiConfig {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.song.lry',
        songid: id,
        platform: 'darwin',
        version: '1.0.0'
      },
      decode: 'baidu_lyric'
    };
  }

  /**
   * 获取封面图片
   */
  async pic(id: string, size: number = 300): Promise<string> {
    const format = this.meting.isFormat;
    const data = await this.meting.format(false).song(id);
    this.meting.isFormat = format;
    const songData = JSON.parse(data);
    const url = songData.songinfo.pic_radio || songData.songinfo.pic_small;
    return JSON.stringify({ url: url });
  }

  /**
   * 格式化百度音乐数据
   */
  format(data: any): any {
    return {
      id: data.song_id,
      name: data.title,
      artist: data.author ? data.author.split(',') : [],
      album: data.album_title || '',
      pic_id: data.song_id,
      url_id: data.song_id,
      lyric_id: data.song_id,
      source: 'baidu'
    };
  }

  /**
   * 处理百度音乐的编码/解码逻辑
   */
  async handleEncode(api: ApiConfig): Promise<ApiConfig> {
    if (api.encode === 'baidu_AESCBC') {
      return this.aesEncrypt(api);
    }
    return api;
  }

  async handleDecode(decodeType: string, data: string): Promise<string> {
    if (decodeType === 'baidu_url') {
      return this.urlDecode(data);
    } else if (decodeType === 'baidu_lyric') {
      return this.lyricDecode(data);
    }
    return data;
  }

  /**
   * 百度音乐 AES 加密
   */
  async aesEncrypt(api: ApiConfig): Promise<ApiConfig> {
    const key = 'DBEECF8C50FD160E';
    const vi = '1231021386755796';

    const body = api.body as Record<string, any>;
    const data = `songid=${body.songid}&ts=${Date.now()}`;

    const cipher = crypto.createCipheriv('aes-128-cbc', key, vi);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    body.e = encrypted;

    return api;
  }

  /**
   * 百度音乐 URL 解码
   */
  async urlDecode(result: string): Promise<string> {
    const data = JSON.parse(result);

    let maxBr = 0;
    let url: any;

    data.songurl.url.forEach((item: any) => {
      if (item.file_bitrate <= this.meting.temp.br && item.file_bitrate > maxBr) {
        maxBr = item.file_bitrate;
        url = {
          url: item.file_link,
          br: item.file_bitrate
        };
      }
    });

    if (!url) {
      url = {
        url: '',
        br: -1
      };
    }

    return JSON.stringify(url);
  }

  /**
   * 百度音乐歌词解码
   */
  async lyricDecode(result: string): Promise<string> {
    const data = JSON.parse(result);
    const lyricData = {
      lyric: data.lrcContent || '',
      tlyric: ''
    };

    return JSON.stringify(lyricData);
  }

  // ========== 私有工具方法 ==========

  /**
   * 生成随机十六进制字符串
   */
  _getRandomHex(length: number): string {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }
}
