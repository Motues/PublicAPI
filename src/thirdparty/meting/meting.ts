/**
 * Meting music framework (TypeScript 版本)
 * 原项目：https://github.com/metowolf/Meting
 */

import { URLSearchParams } from 'url';
import ProviderFactory from './providers/index.js';
import type BaseProvider from './providers/base.js';
import type { ApiConfig } from './providers/base.js';

class Meting {
  VERSION: string;
  raw: string | null;
  info: { statusCode: number; headers: Record<string, string> } | null;
  error: string | null;
  status: string | null;
  temp: Record<string, any>;
  server: string | null;
  provider: BaseProvider | null;
  isFormat: boolean;
  header: Record<string, string>;

  constructor(server: string = 'netease') {
    this.VERSION = '__VERSION__'; // 在构建时由 rollup 替换为实际版本号
    this.raw = null;
    this.info = null;
    this.error = null;
    this.status = null;
    this.temp = {};

    this.server = null;
    this.provider = null;
    this.isFormat = false;
    this.header = {};

    this.site(server);
  }

  // 设置音乐平台
  site(server: string): this {
    if (!ProviderFactory.isSupported(server)) {
      server = 'netease'; // 默认使用网易云音乐
    }

    this.server = server;
    this.provider = ProviderFactory.create(server, this);
    this.header = this.provider.getHeaders();

    return this;
  }

  // 设置 Cookie
  cookie(cookie: string): this {
    this.header['Cookie'] = cookie;
    return this;
  }

  // 设置数据格式化
  format(format: boolean = true): this {
    this.isFormat = format;
    return this;
  }

  // 执行 API 请求的主方法
  async _exec(api: ApiConfig): Promise<string> {
    // 让 Provider 自己处理完整的请求流程
    return await this.provider!.executeRequest(api, this);
  }

  // HTTP 请求方法 - 使用 fetch API
  async _curl(url: string, payload: any = null, headerOnly: boolean = false): Promise<this> {
    const requestOptions: RequestInit & { headers: Record<string, string> } = {
      method: payload ? 'POST' : 'GET',
      headers: { ...this.header }
    };

    // 处理请求体
    if (payload) {
      if (typeof payload === 'object' && !Buffer.isBuffer(payload) && typeof payload !== 'string') {
        payload = new URLSearchParams(payload as Record<string, string>).toString();
        requestOptions.headers!['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      requestOptions.body = payload as BodyInit;
    }

    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    requestOptions.signal = controller.signal;

    let retries = 3;
    const makeRequest = async (): Promise<this> => {
      try {
        const response = await fetch(url, requestOptions as RequestInit);

        clearTimeout(timeoutId);

        // 存储响应信息
        this.info = {
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries())
        };

        // 获取响应数据
        const data = await response.text();
        this.raw = data;
        this.error = null;
        this.status = '';

        return this;
      } catch (err: any) {
        clearTimeout(timeoutId);

        // 处理错误
        if (err.name === 'AbortError') {
          this.error = 'TIMEOUT';
          this.status = 'Request timeout';
        } else {
          this.error = err.code || err.name;
          this.status = err.message;
        }

        // 重试机制
        if (retries > 0) {
          retries--;
          await new Promise(resolve => setTimeout(resolve, 1000));
          return makeRequest();
        } else {
          return this;
        }
      }
    };

    return await makeRequest();
  }


  // ========== 公共 API 方法 ==========

  // 搜索功能
  async search(keyword: string, option: { type?: string | number; limit?: number; page?: number } = {}): Promise<string> {
    const api = this.provider!.search(keyword, option);
    return await this._exec(api);
  }

  // 获取歌曲详情
  async song(id: string): Promise<string> {
    const api = this.provider!.song(id);
    return await this._exec(api);
  }

  // 获取专辑信息
  async album(id: string): Promise<string> {
    const api = this.provider!.album(id);
    return await this._exec(api);
  }

  // 获取艺术家作品
  async artist(id: string, limit: number = 50): Promise<string> {
    const api = this.provider!.artist(id, limit);
    return await this._exec(api);
  }

  // 获取播放列表
  async playlist(id: string): Promise<string> {
    const api = this.provider!.playlist(id);
    return await this._exec(api);
  }

  // 获取音频播放链接
  async url(id: string, br: number = 320): Promise<string> {
    this.temp.br = br;
    const api = this.provider!.url(id, br);
    return await this._exec(api);
  }

  // 获取歌词
  async lyric(id: string): Promise<string> {
    const api = this.provider!.lyric(id);
    return await this._exec(api);
  }

  // 获取封面图片
  async pic(id: string, size: number = 300): Promise<string> {
    return await this.provider!.pic(id, size);
  }

  // ========== 静态方法 ==========

  // 获取支持的平台列表
  static getSupportedPlatforms(): string[] {
    return ProviderFactory.getSupportedPlatforms();
  }

  // 检查平台是否支持
  static isSupported(platform: string): boolean {
    return ProviderFactory.isSupported(platform);
  }
}

export default Meting;
