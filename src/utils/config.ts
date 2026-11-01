import dotenv from 'dotenv';
import process from 'node:process';

dotenv.config();

const splitList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

/** 规范化为 http(s) origin；非法值返回空字符串 */
const normalizeOrigin = (value: string | undefined): string => {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '');
  if (trimmed === '') {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.username === '' &&
      parsed.password === ''
    ) {
      return parsed.origin;
    }
  } catch {
    // 配置错误时按未配置处理，避免把非法值带进 CORS/同源校验
  }

  return '';
};

const rawAllowedOrigins = splitList(process.env.ALLOW_ORIGIN);

export const config = {
  port: Number(process.env.PORT) || 3000,

  allowedOrigins: rawAllowedOrigins
    .map((origin) => (origin === '*' ? '*' : normalizeOrigin(origin)))
    .filter((origin) => origin !== ''),

  /** ALLOW_ORIGIN 未配置或为 `*` 时允许所有来源；配置了但全部非法时按拒绝处理 */
  allowAllOrigins: rawAllowedOrigins.length === 0 || rawAllowedOrigins.includes('*'),

  musicOpen: process.env.MUSIC === 'open',

  avatarOpen: process.env.AVATAR === 'open',

  emojiOpen: process.env.EMOJI === 'open',

  /**
   * 是否信任反向代理传来的客户端 IP 头。
   *
   * 默认 false：直接使用 socket 地址，任何 X-Forwarded-For / CF-Connecting-IP
   * 都不会影响限流、登录锁定和日志。只有在服务确实位于可信代理之后时才打开。
   */
  trustProxy: process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1',

  /** 可信代理地址（逗号分隔，精确匹配 socket 地址）；为空时 trustProxy=true 表示信任所有代理 */
  trustedProxies: splitList(process.env.TRUSTED_PROXIES),

  /** 是否信任 Cloudflare 的 CF-Connecting-IP（仅在使用 Cloudflare 时打开） */
  trustCloudflare: process.env.TRUST_CLOUDFLARE === 'true',

  /** 对外访问地址，用于生成正式 URL / 后台同源校验；留空则按请求推导 */
  publicOrigin: normalizeOrigin(process.env.PUBLIC_ORIGIN),
} as const;
