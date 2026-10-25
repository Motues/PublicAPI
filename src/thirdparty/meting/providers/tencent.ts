import BaseProvider from './base.js';
import type { ApiConfig, MetingLike, SearchOption } from './base.js';

/**
 * QQ 音乐统一网关（u.y.qq.com / musicu.fcg）
 *
 * 2026-10 起逐步把腾讯平台的接口从 c.y.qq.com 的 fcg 接口迁移到统一网关：
 * 搜索、歌曲详情、专辑、歌手、歌单、歌词、播放地址全部走 musicu。
 */
const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';

/**
 * musicu 的公共参数
 * 注意：ct 不能是 24，搜索结果会为空；ct=19（或 11）才能拿到数据
 */
const MUSICU_COMM = {
  uin: '0',
  format: 'json',
  ct: 19,
  cv: 1859
};

/**
 * musicu 搜索被风控（code 2001）后的冷却截止时间，
 * 期间直接使用旧搜索接口，避免每次请求都先撞一次风控
 */
let musicuSearchBlockedUntil = 0;

/**
 * 腾讯音乐平台提供者
 */
export default class TencentProvider extends BaseProvider {
  /**
   * 最近一次搜索参数，用于 musicu 搜索被风控时回退到旧接口
   */
  private lastSearch: { keyword: string; option: SearchOption } | null = null;

  constructor(meting: any) {
    super(meting);
    this.name = 'tencent';
  }

  /**
   * 获取腾讯音乐的请求头配置
   */
  getHeaders(): Record<string, string> {
    return {
      'Referer': 'https://y.qq.com/',
      'Cookie': 'pgv_pvi=22038528; pgv_si=s3156287488; pgv_pvid=5535248600; yplayer_open=1; ts_last=y.qq.com/portal/player.html; ts_uid=4847550686; yq_index=0; qqmusic_fromtag=66; player_exist=1',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.8,gl;q=0.6,zh-TW;q=0.4',
      'Connection': 'keep-alive',
      'Content-Type': 'application/x-www-form-urlencoded'
    };
  }

  /**
   * 构造一个 musicu.fcg 请求
   * @param req0 req_0 段（module / method / param）
   * @param extra 额外的 ApiConfig 字段（format / decode）
   */
  musicu(req0: Record<string, any>, extra: Partial<ApiConfig> = {}): ApiConfig {
    return {
      method: 'GET',
      url: MUSICU_URL,
      body: {
        format: 'json',
        platform: 'yqq.json',
        needNewCode: 0,
        data: JSON.stringify({
          req_0: req0,
          comm: MUSICU_COMM
        })
      },
      ...extra
    };
  }

  /**
   * 搜索歌曲
   * 优先走 musicu；若被风控（req_0.code=2001，返回空列表）则回退到 c.y.qq.com
   */
  search(keyword: string, option: SearchOption = {}): ApiConfig {
    this.lastSearch = { keyword, option };

    // musicu 搜索被风控期间，直接走旧接口，避免每次多一次无效请求
    if (Date.now() < musicuSearchBlockedUntil) {
      return this.legacySearch(keyword, option);
    }

    return this.musicu(
      {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicDesktop',
        param: {
          query: keyword,
          page_num: option.page || 1,
          num_per_page: option.limit || 30,
          search_type: 0
        }
      },
      { format: 'req_0.data.body.song.list' }
    );
  }

  /**
   * 旧版搜索接口（musicu 搜索被风控时的兜底）
   */
  legacySearch(keyword: string, option: SearchOption = {}): ApiConfig {
    return {
      method: 'GET',
      url: 'https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp',
      body: {
        format: 'json',
        p: option.page || 1,
        n: option.limit || 30,
        w: keyword
      },
      format: 'data.song.list'
    };
  }

  /**
   * 执行请求：musicu 搜索返回空结果时回退到旧搜索接口
   */
  async executeRequest(api: ApiConfig, meting: MetingLike): Promise<string> {
    const result = await super.executeRequest(api, meting);

    if (api.format === 'req_0.data.body.song.list' && result === '[]' && this.lastSearch) {
      // req_0.code = 2001：搜索接口风控，10 分钟内直接走旧接口
      if (meting.raw && /"code"\s*:\s*2001/.test(meting.raw)) {
        musicuSearchBlockedUntil = Date.now() + 10 * 60 * 1000;
      }

      return super.executeRequest(this.legacySearch(this.lastSearch.keyword, this.lastSearch.option), meting);
    }

    return result;
  }

  /**
   * 获取歌曲详情
   */
  song(id: string): ApiConfig {
    return this.musicu(
      {
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail',
        param: { song_mid: id }
      },
      { format: 'req_0.data.track_info' }
    );
  }

  /**
   * 获取专辑信息
   */
  album(id: string): ApiConfig {
    return this.musicu(
      {
        module: 'music.musichallAlbum.AlbumSongList',
        method: 'GetAlbumSongList',
        param: { albumMid: id, begin: 0, num: 1000 }
      },
      { format: 'req_0.data.songList' }
    );
  }

  /**
   * 获取艺术家作品
   */
  artist(id: string, limit: number = 50): ApiConfig {
    return this.musicu(
      {
        module: 'musichall.song_list_server',
        method: 'GetSingerSongList',
        param: { singerMid: id, order: 1, begin: 0, num: limit }
      },
      { format: 'req_0.data.songList' }
    );
  }

  /**
   * 获取播放列表
   */
  playlist(id: string): ApiConfig {
    return this.musicu(
      {
        module: 'music.srfDissInfo.DissInfo',
        method: 'CgiGetDiss',
        param: {
          disstid: /^\d+$/.test(id) ? Number(id) : id,
          dirid: 0,
          tag: 1,
          song_begin: 0,
          song_num: 1000,
          userinfo: 1
        }
      },
      { format: 'req_0.data.songlist' }
    );
  }

  /**
   * 获取音频播放链接
   * 先取歌曲详情，再在 urlDecode 里请求 vkey
   */
  url(id: string, br: number = 320): ApiConfig {
    return this.musicu(
      {
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail',
        param: { song_mid: id }
      },
      { decode: 'tencent_url' }
    );
  }

  /**
   * 获取歌词
   */
  lyric(id: string): ApiConfig {
    return this.musicu(
      {
        module: 'music.musichallSong.PlayLyricInfo',
        method: 'GetPlayLyricInfo',
        param: { songMID: id, songID: 0 }
      },
      { decode: 'tencent_lyric' }
    );
  }

  /**
   * 获取封面图片
   */
  async pic(id: string, size: number = 300): Promise<string> {
    if (!id) {
      return JSON.stringify({ url: '' });
    }
    const url = `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${id}.jpg?max_age=2592000`;
    return JSON.stringify({ url: url });
  }

  /**
   * 格式化腾讯音乐数据
   * musicu 返回的 track_info / songInfo 使用新版字段（mid / name / album.title），
   * 这里同时兼容旧版字段（songmid / songname / albummid / albumname）
   */
  format(data: any): any {
    if (!data || typeof data !== 'object') {
      return { id: '', name: '', artist: [], album: '', pic_id: '', url_id: '', lyric_id: '', source: 'tencent' };
    }

    if (data.musicData) {
      data = data.musicData;
    }
    if (data.songInfo) {
      data = data.songInfo;
    }

    const mid = data.songmid || data.mid;
    const album = data.album && data.album.title !== undefined
      ? data.album.title
      : (data.albumname || '');

    const result: any = {
      id: mid,
      name: data.songname || data.name,
      artist: [],
      album: String(album || '').trim(),
      pic_id: (data.album && data.album.mid) || data.albummid,
      url_id: mid,
      lyric_id: mid,
      source: 'tencent'
    };

    (data.singer || []).forEach((singer: any) => {
      result.artist.push(singer.name);
    });

    return result;
  }

  /**
   * 处理腾讯音乐的解码逻辑
   */
  async handleDecode(decodeType: string, data: string): Promise<string> {
    if (decodeType === 'tencent_url') {
      return this.urlDecode(data);
    } else if (decodeType === 'tencent_lyric') {
      return this.lyricDecode(data);
    }
    return data;
  }

  /**
   * 腾讯音乐 URL 解码
   */
  async urlDecode(result: string): Promise<string> {
    const payload = JSON.parse(result);
    const song = payload?.req_0?.data?.track_info
      || payload?.track_info
      || (payload?.data && payload.data[0]);

    // 歌曲信息缺失（下架/请求失败）时直接返回空链接
    if (!song || !song.file) {
      return JSON.stringify({ url: '', size: 0, br: -1 });
    }

    const guid = Math.floor(Math.random() * 10000000000);

    const qualityMap: [string, number, string, string][] = [
      ['size_flac', 999, 'F000', 'flac'],
      ['size_320mp3', 320, 'M800', 'mp3'],
      ['size_192aac', 192, 'C600', 'm4a'],
      ['size_128mp3', 128, 'M500', 'mp3'],
      ['size_96aac', 96, 'C400', 'm4a'],
      ['size_48aac', 48, 'C200', 'm4a'],
      ['size_24aac', 24, 'C100', 'm4a']
    ];

    let uin = '0';
    const uinMatch = this.meting.header.Cookie && this.meting.header.Cookie.match(/uin=(\d+)/);
    if (uinMatch) {
      uin = uinMatch[1];
    }

    const payloadVkey: any = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid: String(guid),
          songmid: [],
          filename: [],
          songtype: [],
          uin: uin,
          loginflag: 1,
          platform: '20'
        }
      },
      comm: {
        ...MUSICU_COMM,
        uin: uin
      }
    };

    qualityMap.forEach(([sizeKey, br, prefix, ext]) => {
      payloadVkey.req_0.param.songmid.push(song.mid);
      payloadVkey.req_0.param.filename.push(`${prefix}${song.file.media_mid}.${ext}`);
      payloadVkey.req_0.param.songtype.push(song.type);
    });

    const api: ApiConfig = {
      method: 'GET',
      url: MUSICU_URL,
      body: {
        format: 'json',
        platform: 'yqq.json',
        needNewCode: 0,
        data: JSON.stringify(payloadVkey)
      }
    };

    const response = JSON.parse(await this.meting._exec(api));
    const vkeys = response?.req_0?.data?.midurlinfo || [];
    const sip = response?.req_0?.data?.sip || [];

    let url: any;
    for (let i = 0; i < qualityMap.length; i++) {
      const [sizeKey, br] = qualityMap[i];
      if (song.file[sizeKey] && br <= this.meting.temp.br) {
        if (vkeys[i] && vkeys[i].vkey && sip.length) {
          url = {
            url: sip[0] + vkeys[i].purl,
            size: song.file[sizeKey],
            br: br
          };
          break;
        }
      }
    }

    if (!url) {
      url = {
        url: '',
        size: 0,
        br: -1
      };
    }

    return JSON.stringify(url);
  }

  /**
   * 解码 HTML 实体编码
   */
  decodeHtmlEntities(text: string): string {
    if (!text) return text;

    // 常见HTML实体编码映射
    const entityMap: Record<string, string> = {
      '&apos;': "'",
      '&quot;': '"',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&nbsp;': ' '
    };

    // 替换命名实体
    let decoded = text;
    for (const [entity, char] of Object.entries(entityMap)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // 替换数字实体（如 &#39; &#34; 等）
    decoded = decoded.replace(/&#(\d+);/g, (match: string, dec: string) => {
      return String.fromCharCode(parseInt(dec, 10));
    });

    // 替换十六进制实体（如 &#x27; 等）
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match: string, hex: string) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    return decoded;
  }

  /**
   * 腾讯音乐歌词解码
   * musicu 的 GetPlayLyricInfo 返回 base64 编码的 LRC（lyric / trans），
   * 同时兼容旧 fcg 接口的 MusicJsonCallback 包装
   */
  async lyricDecode(result: string): Promise<string> {
    try {
      let raw = (result || '').trim();
      if (raw.startsWith('MusicJsonCallback')) {
        raw = raw.substring(18, raw.length - 1);
      }

      const payload = JSON.parse(raw);
      const data = payload?.req_0?.data || payload?.data || payload;

      const decode = (value: string): string => {
        if (!value) return '';
        // 新版返回 base64，旧版可能已经是明文
        const decoded = /^[A-Za-z0-9+/=\s]+$/.test(value)
          ? Buffer.from(value, 'base64').toString('utf8')
          : value;
        return this.decodeHtmlEntities(decoded);
      };

      return JSON.stringify({
        lyric: decode(data?.lyric),
        tlyric: decode(data?.trans)
      });
    } catch (e) {
      return JSON.stringify({ lyric: '', tlyric: '' });
    }
  }
}
