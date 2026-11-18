import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { canonicalIP, getClientIP } from '../ip.js';
import { logger } from '../logger.js';

/** 日志字段清洗：去掉控制字符（防日志注入 / ANSI 转义），并限制长度 */
const sanitizeForLog = (value: string, maxLength = 200): string =>
  value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);

/** 访问域名：优先 Host 头（实际访问到的域名），缺失时回退 X-Forwarded-Host / 请求 URL */
const getRequestHost = (c: Context): string => {
  const host = c.req.header('host')?.trim();
  if (host) {
    return host;
  }

  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    return forwardedHost;
  }

  try {
    return new URL(c.req.url).host;
  } catch {
    return '';
  }
};

/** 访问日志开关 */
export interface AccessLogOptions {
  /** 是否附带访问域名（Host） */
  logHost?: boolean;
  /** 是否附带客户端 IP（受 TRUST_PROXY 配置影响） */
  logIp?: boolean;
}

/**
 * 创建访问日志中间件
 *
 * 逐条记录公开接口的「方法 + 路径 + 状态码 + 耗时」，并按开关附带访问域名与客户端 IP。
 * 默认取环境变量 LOG_ACCESS_HOST / LOG_ACCESS_IP（两者都关闭时只会输出基础行，
 * 因此调用方应在任一开关打开时才挂载）。
 * @param options 覆盖项，主要用于测试或调用方自定义
 * @returns Hono 中间件
 */
export const createAccessLogMiddleware = (options: AccessLogOptions = {}) => {
  const logHost = options.logHost ?? config.logAccessHost;
  const logIp = options.logIp ?? config.logAccessIp;

  return async (c: Context, next: Next): Promise<void> => {
    const startedAt = Date.now();
    let status = 0;

    try {
      await next();
      status = c.res?.status ?? 0;
    } catch (error) {
      // 交给全局 onError 返回 500，这里只保证访问日志也能记到这条失败请求
      status = 500;
      throw error;
    } finally {
      const parts = [
        `${c.req.method} ${sanitizeForLog(c.req.path)}`,
        `${status}`,
        `${Date.now() - startedAt}ms`,
      ];

      if (logHost) {
        parts.push(`host=${sanitizeForLog(getRequestHost(c)) || '-'}`);
      }
      if (logIp) {
        parts.push(`ip=${sanitizeForLog(canonicalIP(getClientIP(c))) || '-'}`);
      }

      logger.info(parts.join(' '), 'Access');
    }
  };
};

/** 按环境变量配置的默认访问日志中间件 */
export const accessLogMiddleware = createAccessLogMiddleware();
