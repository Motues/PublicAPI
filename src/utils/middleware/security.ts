import { secureHeaders } from 'hono/secure-headers';

/**
 * 全局安全响应头。
 *
 * 注意：不要启用 `Cross-Origin-Resource-Policy: same-origin`，
 * 否则其他站点通过 <img> 引用本站表情图片会被浏览器拦截。
 * HSTS 交给反向代理统一设置，避免在纯 HTTP 开发环境误发。
 */
export const securityHeaders = secureHeaders({
  strictTransportSecurity: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  xFrameOptions: 'DENY',
  referrerPolicy: 'no-referrer',
  contentSecurityPolicy: {
    frameAncestors: ["'none'"],
  },
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
  },
});
