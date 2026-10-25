import BaseProvider from './base.js';
import type { ApiConfig, MetingLike, SearchOption } from './base.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * songinfo 短缓存
 * 酷我 songinfo 节点不稳定，一次成功请求可能要重试 2~3 次；
 * 详情/封面/歌词都会用到它，这里做进程级短缓存以降低对上游的请求量。
 */
const SONGINFO_TTL = 10 * 60 * 1000;
const SONGINFO_MAX = 500;
const songinfoCache = new Map<string, { raw: string; exp: number }>();

function getSonginfoCache(id: string): string | null {
  const entry = songinfoCache.get(id);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    songinfoCache.delete(id);
    return null;
  }
  return entry.raw;
}

function setSonginfoCache(id: string, raw: string): void {
  if (!id || !raw) return;
  if (songinfoCache.size >= SONGINFO_MAX) {
    const oldest = songinfoCache.keys().next().value;
    if (oldest !== undefined) songinfoCache.delete(oldest);
  }
  songinfoCache.set(id, { raw, exp: Date.now() + SONGINFO_TTL });
}

/**
 * 酷我 songinfo 接口需要首页下发的 Hm_Iuvt_* 反爬 Cookie，
 * 这里做进程级缓存，避免每个请求都去拉一次首页
 */
const KUWO_COOKIE_TTL = 30 * 60 * 1000;
const KUWO_COOKIE_RETRY = 60 * 1000;
let kuwoCookie = '';
let kuwoCookieExpire = 0;
let kuwoCookieRetryAt = 0;

async function getKuwoCookie(): Promise<string> {
  if (kuwoCookie && Date.now() < kuwoCookieExpire) {
    return kuwoCookie;
  }
  if (Date.now() < kuwoCookieRetryAt) {
    return kuwoCookie;
  }

  try {
    const res = await fetch('https://www.kuwo.cn/', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    const setCookies: string[] = (res.headers as any).getSetCookie?.() || [];
    const pairs = setCookies
      .map(cookie => cookie.split(';')[0].trim())
      .filter(cookie => cookie.includes('='));

    if (pairs.length) {
      kuwoCookie = pairs.join('; ');
      kuwoCookieExpire = Date.now() + KUWO_COOKIE_TTL;
    }
    await res.text();
  } catch (e) {
    // 获取失败时短时间内不再重试，避免每个请求都等首页超时
    kuwoCookieRetryAt = Date.now() + KUWO_COOKIE_RETRY;
  }

  return kuwoCookie;
}

/**
 * 解码 HTML 实体（酷我接口返回的文本里带有 &nbsp; / &amp; 等）
 */
function htmlDecode(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * 解析酷我接口返回的「类 JSON」文本（单引号键值、JS 转义）
 * 酷我 search.kuwo.cn/r.s 系列接口返回的就是这种格式，不能直接 JSON.parse
 */
function parseLooseJson(input: string): any {
  const text = (input || '').trim();
  if (!text) return null;
  if (text.startsWith('{') || text.startsWith('[')) {
    let out = '';
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (ch === "'") {
        // 单引号字符串 -> JSON 字符串
        let j = i + 1;
        let value = '';
        while (j < text.length) {
          const c = text[j];
          if (c === '\\') {
            const esc = text[j + 1];
            switch (esc) {
              case 'n': value += '\n'; j += 2; break;
              case 'r': value += '\r'; j += 2; break;
              case 't': value += '\t'; j += 2; break;
              case 'b': value += '\b'; j += 2; break;
              case 'f': value += '\f'; j += 2; break;
              case 'v': value += '\v'; j += 2; break;
              case 'x':
                value += String.fromCharCode(parseInt(text.slice(j + 2, j + 4), 16));
                j += 4;
                break;
              case 'u':
                value += String.fromCharCode(parseInt(text.slice(j + 2, j + 6), 16));
                j += 6;
                break;
              default:
                value += esc === undefined ? '' : esc;
                j += 2;
            }
            continue;
          }
          if (c === "'") {
            j += 1;
            break;
          }
          value += c;
          j += 1;
        }
        // 处理被多重转义的 \uXXXX（酷我会输出 \\u0026 这类转义）
        value = value
          .replace(/\\+u([0-9a-fA-F]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
          .replace(/\\+&/g, '&');
        out += JSON.stringify(value);
        i = j;
        continue;
      }

      if (ch === '"') {
        // 双引号字符串原样保留
        let j = i + 1;
        while (j < text.length) {
          if (text[j] === '\\') { j += 2; continue; }
          if (text[j] === '"') { j += 1; break; }
          j += 1;
        }
        out += text.slice(i, j);
        i = j;
        continue;
      }

      out += ch;
      i += 1;
    }

    try {
      return JSON.parse(out);
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * 酷我音乐平台提供者
 *
 * 2026-10 起 www.kuwo.cn/api/www/* 接口统一返回 "The request is illegal!"，
 * 原接口（搜索/专辑/歌手/歌单/播放地址）已全部不可用。
 * 这里改用仍可访问的接口：
 * - 搜索/专辑/歌手：search.kuwo.cn/r.s（返回类 JSON 文本，需宽松解析）
 * - 歌曲信息/歌词：m.kuwo.cn/newh5/singles/songinfoandlrc
 * - 歌单：nplserver.kuwo.cn/pl.svc
 * - 播放地址：antiserver.kuwo.cn/anti.s
 */
export default class KuwoProvider extends BaseProvider {
  constructor(meting: any) {
    super(meting);
    this.name = 'kuwo';
  }

  /**
   * 获取酷我音乐的请求头配置
   */
  getHeaders(): Record<string, string> {
    return {
      'User-Agent': UA,
      'Referer': 'https://www.kuwo.cn/',
      'Accept': '*/*'
    };
  }

  /**
   * 执行请求前补上酷我的反爬 Cookie；
   * songinfo 接口在多个后端节点间轮询，偶尔会返回 data:null，这里自动重试
   */
  async executeRequest(api: ApiConfig, meting: MetingLike): Promise<string> {
    if (!this.meting.header['Cookie']) {
      const cookie = await getKuwoCookie();
      if (cookie) {
        this.meting.header['Cookie'] = cookie;
      }
    }

    const body = api.body && typeof api.body === 'object' ? { ...(api.body as Record<string, any>) } : api.body;
    const cloneBody = () => (body && typeof body === 'object' ? { ...(body as Record<string, any>) } : body);
    const run = (targetUrl: string = api.url): Promise<string> =>
      super.executeRequest({ ...api, url: targetUrl, body: cloneBody() }, meting);

    let result = await run();

    const isSonginfo = api.url.includes('/newh5/singles/songinfoandlrc');
    const musicId = String((api.body as any)?.musicId || '');

    if (isSonginfo) {
      // m.kuwo.cn 与 www.kuwo.cn 由不同节点服务，失败时轮换重试
      let target = this.alternateSonginfoHost(api.url);
      for (let attempt = 0; attempt < 3 && this.songinfoFailed(meting.raw); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        result = await run(target);
        target = this.alternateSonginfoHost(target);
      }

      if (!this.songinfoFailed(meting.raw)) {
        setSonginfoCache(musicId, meting.raw as string);
      }
    }

    return result;
  }

  /**
   * 轮换 songinfo 接口的域名（m.kuwo.cn <-> www.kuwo.cn）
   */
  alternateSonginfoHost(url: string): string {
    if (url.includes('//m.kuwo.cn/')) {
      return url.replace('//m.kuwo.cn/', '//www.kuwo.cn/');
    }
    return url.replace('//www.kuwo.cn/', '//m.kuwo.cn/');
  }

  /**
   * 判断 songinfo 响应是否为瞬时失败
   * 某些节点只返回 lrclist 而没有 songinfo，或 songinfo 缺少歌名，需要重试
   */
  songinfoFailed(raw: string | null): boolean {
    if (!raw) return true;
    try {
      const data = JSON.parse(raw);
      const info = data?.data?.songinfo;
      return !info || !info.songName;
    } catch (e) {
      return true;
    }
  }

  /**
   * 搜索歌曲
   */
  search(keyword: string, option: SearchOption = {}): ApiConfig {
    return {
      method: 'GET',
      url: 'https://search.kuwo.cn/r.s',
      body: {
        all: keyword,
        ft: 'music',
        itemset: 'web_2013',
        client: 'kt',
        pn: Math.max((option.page || 1) - 1, 0),
        rn: option.limit || 30,
        rformat: 'json',
        encoding: 'utf8',
        // 带上 vipver 才会返回 ALBUM / web_albumpic_short 等完整字段
        vipver: 1,
        show_copyright_off: 1
      },
      format: 'abslist'
    };
  }

  /**
   * 获取歌曲详情
   */
  song(id: string): ApiConfig {
    return {
      method: 'GET',
      url: 'https://m.kuwo.cn/newh5/singles/songinfoandlrc',
      body: {
        musicId: this.normalizeId(id)
      },
      format: 'data.songinfo'
    };
  }

  /**
   * 获取专辑信息
   */
  album(id: string): ApiConfig {
    return {
      method: 'GET',
      url: 'https://search.kuwo.cn/r.s',
      body: {
        st: 'album',
        albumid: id,
        pn: 0,
        rn: 1000,
        rformat: 'json',
        encoding: 'utf8',
        client: 'kt',
        vipver: 1,
        show_copyright_off: 1
      },
      format: 'abslist'
    };
  }

  /**
   * 获取艺术家作品
   */
  artist(id: string, limit: number = 50): ApiConfig {
    return {
      method: 'GET',
      url: 'https://search.kuwo.cn/r.s',
      body: {
        st: 'artist2music',
        artistid: id,
        pn: 0,
        rn: limit,
        rformat: 'json',
        encoding: 'utf8',
        client: 'kt',
        vipver: 1,
        show_copyright_off: 1
      },
      format: 'abslist'
    };
  }

  /**
   * 获取播放列表
   */
  playlist(id: string): ApiConfig {
    return {
      method: 'GET',
      url: 'http://nplserver.kuwo.cn/pl.svc',
      body: {
        op: 'getlistinfo',
        pid: id,
        pn: 0,
        rn: 1000,
        encode: 'utf8',
        keyset: 'pl2012',
        identity: 'kuwo',
        pc: 1,
        vipver: 1,
        show_copyright_off: 1
      },
      format: 'musiclist'
    };
  }

  /**
   * 获取音频播放链接
   */
  url(id: string, br: number = 320): ApiConfig {
    return {
      method: 'GET',
      url: 'https://antiserver.kuwo.cn/anti.s',
      body: {
        type: 'convert_url3',
        rid: this.normalizeId(id),
        format: 'mp3'
      },
      decode: 'kuwo_url'
    };
  }

  /**
   * 获取歌词
   */
  lyric(id: string): ApiConfig {
    return {
      method: 'GET',
      url: 'https://m.kuwo.cn/newh5/singles/songinfoandlrc',
      body: {
        musicId: this.normalizeId(id)
      },
      decode: 'kuwo_lyric'
    };
  }

  /**
   * 获取封面图片
   */
  async pic(id: string, size: number = 300): Promise<string> {
    try {
      const key = this.normalizeId(id);
      let raw = getSonginfoCache(key);

      if (!raw) {
        const format = this.meting.isFormat;
        raw = await this.meting.format(false).song(key);
        this.meting.isFormat = format;

        if (raw && !this.songinfoFailed(raw)) {
          setSonginfoCache(key, raw);
        }
      }

      if (!raw) {
        return JSON.stringify({ url: '' });
      }

      const data = JSON.parse(raw);
      const songinfo = data?.data?.songinfo;
      let url = String(songinfo?.pic || songinfo?.albumpic || '');
      // kwcdn 域名证书与主机名不匹配，换成支持 HTTPS 的 img1.kuwo.cn
      url = url.replace(/\/\/[^/]*kwcdn\.kuwo\.cn\//i, '//img1.kuwo.cn/').replace(/^http:\/\//i, 'https://');
      return JSON.stringify({ url: url });
    } catch (e) {
      return JSON.stringify({ url: '' });
    }
  }

  /**
   * 格式化酷我音乐数据
   * 兼容搜索/专辑/歌手/歌单/歌曲详情等不同接口的字段命名
   */
  format(data: any): any {
    if (!data) {
      return { id: '', name: '', artist: [], album: '', pic_id: '', url_id: '', lyric_id: '', source: 'kuwo' };
    }

    const rawRid = data.rid ?? data.DC_TARGETID ?? data.id ??
      data.musicrId ?? data.MUSICRID ?? data.rid2 ?? '';
    const rid = this.normalizeId(String(rawRid));

    const name = data.name ?? data.NAME ?? data.songName ?? data.FSONGNAME ?? '';
    const artist = data.artist ?? data.ARTIST ?? data.FARTIST ?? '';
    const album = data.album ?? data.ALBUM ?? data.FALBUM ?? '';

    return {
      id: rid,
      name: htmlDecode(name),
      artist: artist ? htmlDecode(String(artist)).split('&') : [],
      album: htmlDecode(album),
      pic_id: rid,
      url_id: rid,
      lyric_id: rid,
      source: 'kuwo'
    };
  }

  /**
   * 宽松解析响应（酷我返回类 JSON 文本）
   */
  parseJson(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return parseLooseJson(raw);
    }
  }

  /**
   * 处理酷我音乐的解码逻辑
   */
  async handleDecode(decodeType: string, data: string): Promise<string> {
    if (decodeType === 'kuwo_url') {
      return this.urlDecode(data);
    } else if (decodeType === 'kuwo_lyric') {
      return this.lyricDecode(data);
    }
    return data;
  }

  /**
   * 酷我音乐 URL 解码
   */
  async urlDecode(result: string): Promise<string> {
    try {
      const data = JSON.parse(result);
      if (data && Number(data.code) === 200 && data.url) {
        return JSON.stringify({
          url: data.url,
          size: 0,
          br: this.meting.temp.br || 128
        });
      }
    } catch (e) {
      // 非 JSON 响应（例如直接返回播放地址文本）
      const text = (result || '').trim();
      if (/^https?:\/\//i.test(text)) {
        return JSON.stringify({ url: text, size: 0, br: 128 });
      }
    }

    return JSON.stringify({ url: '', size: 0, br: -1 });
  }

  /**
   * 酷我音乐歌词解码
   */
  async lyricDecode(result: string): Promise<string> {
    let data: any = null;
    try {
      data = JSON.parse(result);
    } catch (e) {
      return JSON.stringify({ lyric: '', tlyric: '' });
    }
    const list = data?.data?.lrclist || [];

    let lyric = '';
    for (const item of list) {
      const time = parseFloat(item.time);
      if (Number.isNaN(time)) continue;
      const min = Math.floor(time / 60).toString().padStart(2, '0');
      const sec = Math.floor(time % 60).toString().padStart(2, '0');
      const msec = Math.round((time % 1) * 1000).toString().padStart(3, '0');
      lyric += `[${min}:${sec}.${msec}]${item.lineLyric}\n`;
    }

    return JSON.stringify({ lyric: lyric, tlyric: '' });
  }

  /**
   * 将 MUSIC_xxx 形式的 ID 转换为纯数字 ID
   */
  normalizeId(id: string): string {
    return String(id || '').replace(/^MUSIC_/i, '').trim();
  }
}
