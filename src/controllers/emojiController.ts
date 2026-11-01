import type { Context } from 'hono';
import { loadEmojiData, loadSiteConfig } from '../utils/dataLoader.js';
import type { EmojiData } from '../utils/defaultEmoji.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * 表情数据接口
 *
 * 返回 OwO 格式的表情数据（兼容 Twikoo / Artalk / Waline），
 * 数据来自 data/config/emoji.json，图片表情的 icon 为站内相对路径，
 * 返回前会按请求域名补全为绝对地址（使用方页面会直接把 icon 当 HTML 插入）。
 */

/** 只匹配 src 为站内单一斜杠开头路径的图片标签 */
const INNER_IMG_SRC = /(<img\b[^>]*?\ssrc=["'])(\/[^"']*)(["'])/gi;

/** 非法 Host 告警节流，避免被恶意请求刷日志 */
let lastUnsafeOriginWarning = 0;

/**
 * 把协议 + Host 规范化成安全的 origin。
 *
 * Host / X-Forwarded-Host 是客户端可控输入，而表情 icon 会被使用方当 HTML 插入，
 * 因此这里只接受合法的 http(s) origin，拒绝引号、尖括号、反斜杠、路径、用户信息等。
 * @returns 规范化后的 origin；不合法时返回 null
 */
const normalizeOrigin = (protocol: string | undefined, host: string | undefined): string | null => {
  const proto = (protocol ?? '').trim().toLowerCase();
  const rawHost = (host ?? '').trim();

  if (proto !== 'http' && proto !== 'https') {
    return null;
  }
  if (rawHost === '' || rawHost.length > 255 || /[\u0000-\u0020"'<>\\/?#@%]/.test(rawHost)) {
    return null;
  }

  try {
    const parsed = new URL(`${proto}://${rawHost}`);
    if (
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

/**
 * 推导本站对外访问地址
 *
 * 优先级：后台「表情数据 → 对外访问地址」 > X-Forwarded-Proto/X-Forwarded-Host > 请求自身地址。
 * Host 不合法时返回空字符串，让图标保持站内相对路径，避免把注入内容拼进 HTML。
 */
export const resolveBaseUrl = (c: Context): string => {
  const configured = loadSiteConfig().emojiBaseUrl;
  if (configured) {
    return configured;
  }

  // 显式配置的对外地址优先于任何请求头
  if (config.publicOrigin) {
    return config.publicOrigin;
  }

  const requestUrl = new URL(c.req.url);
  const requestProtocol = requestUrl.protocol.replace(':', '');
  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const hostHeader = c.req.header('host')?.trim();

  const candidates: Array<[string | undefined, string | undefined]> = [
    [forwardedProto, forwardedHost],
    [forwardedProto ?? requestProtocol, hostHeader],
    [requestProtocol, requestUrl.host],
  ];

  for (const [protocol, host] of candidates) {
    const origin = normalizeOrigin(protocol, host);
    if (origin) {
      return origin;
    }
  }

  const now = Date.now();
  if (now - lastUnsafeOriginWarning > 60_000) {
    lastUnsafeOriginWarning = now;
    logger.warn('Rejected unsafe host/protocol for emoji base URL', 'Emoji');
  }
  return '';
};

/** 把图片表情里的站内相对地址补全为绝对地址（外链与协议相对地址保持不变） */
export const absolutizeIcons = (data: EmojiData, baseUrl: string): EmojiData => {
  const result: EmojiData = {};

  for (const [name, group] of Object.entries(data)) {
    result[name] = group.type === 'image'
      ? {
          type: group.type,
          container: group.container.map((item) => ({
            icon: item.icon.replace(INNER_IMG_SRC, (matched, prefix: string, src: string, suffix: string) =>
              src.startsWith('//') ? matched : `${prefix}${baseUrl}${src}${suffix}`
            ),
            text: item.text,
          })),
        }
      : group;
  }

  return result;
};

/** GET /emoji/owo.json —— 返回 OwO 格式表情数据，支持 ?group=分组名 单组筛选 */
export const getEmojiData = (c: Context) => {
  const data = loadEmojiData();
  const group = c.req.query('group')?.trim();
  const baseUrl = resolveBaseUrl(c);

  let payload: EmojiData = data;

  if (group) {
    const matched = data[group];
    if (!matched) {
      return c.json({
        error: 'Not Found',
        message: `找不到名为 ${group} 的表情分组`,
        groups: Object.keys(data),
      }, 404);
    }
    payload = { [group]: matched };
  }

  const body = absolutizeIcons(payload, baseUrl);
  const count = Object.values(body).reduce((sum, item) => sum + item.container.length, 0);

  logger.info(`Group: ${group || 'all'}, Count: ${count}, BaseUrl: ${baseUrl}`, 'Emoji');

  return c.json(body, 200, {
    'Cache-Control': 'public, max-age=3600',
  });
};
