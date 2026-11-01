import process from 'node:process';
import { config } from './config.js';

export interface NetworkSetting {
  key: 'TRUST_PROXY' | 'TRUSTED_PROXIES' | 'TRUST_CLOUDFLARE' | 'PUBLIC_ORIGIN';
  value: string;
  source: '环境变量' | '默认值';
  description: string;
}

export interface NetworkInfo {
  settings: NetworkSetting[];
  warnings: string[];
}

const hasEnv = (name: string): boolean => (process.env[name] ?? '').trim() !== '';

/**
 * 后台「网络与代理」只读视图。
 *
 * 这些值决定客户端 IP 与对外地址的信任边界，故意只允许环境变量/部署配置修改，
 * 不提供面板写接口，避免后台配置被误改或成为绕过限流的入口。
 */
export const getNetworkInfo = (): NetworkInfo => {
  const settings: NetworkSetting[] = [
    {
      key: 'TRUST_PROXY',
      value: config.trustProxy ? 'true' : 'false',
      source: hasEnv('TRUST_PROXY') ? '环境变量' : '默认值',
      description: '是否信任反向代理传来的客户端 IP 头',
    },
    {
      key: 'TRUSTED_PROXIES',
      value: config.trustedProxies.length > 0 ? config.trustedProxies.join(', ') : '（空）',
      source: hasEnv('TRUSTED_PROXIES') ? '环境变量' : '默认值',
      description: '可信代理地址，仅接受这些地址的转发头',
    },
    {
      key: 'TRUST_CLOUDFLARE',
      value: config.trustCloudflare ? 'true' : 'false',
      source: hasEnv('TRUST_CLOUDFLARE') ? '环境变量' : '默认值',
      description: '是否使用 Cloudflare 的 CF-Connecting-IP',
    },
    {
      key: 'PUBLIC_ORIGIN',
      value: config.publicOrigin || '（空，按请求头推导）',
      source: hasEnv('PUBLIC_ORIGIN') ? '环境变量' : '默认值',
      description: '对外访问地址，用于绝对 URL 与后台同源校验',
    },
  ];

  const warnings: string[] = [];

  if (config.trustProxy && config.trustedProxies.length === 0) {
    warnings.push('TRUST_PROXY=true 且未配置 TRUSTED_PROXIES：会信任任意来源的 X-Forwarded-For，公网直连时会绕过限流/登录锁定。');
  }
  if (config.trustCloudflare && !config.trustProxy) {
    warnings.push('TRUST_CLOUDFLARE=true 但 TRUST_PROXY=false：CF-Connecting-IP 不会被使用。');
  }
  if (hasEnv('TRUST_PROXY') && !['true', 'false', '1', '0'].includes((process.env.TRUST_PROXY ?? '').trim().toLowerCase())) {
    warnings.push('TRUST_PROXY 的值不是 true/false/1/0，当前按关闭处理。');
  }
  if (hasEnv('PUBLIC_ORIGIN') && config.publicOrigin === '') {
    warnings.push('PUBLIC_ORIGIN 不是合法的 http(s) origin，当前按空值处理。');
  }
  if (config.publicOrigin === '' && !config.trustProxy) {
    warnings.push('未设置 PUBLIC_ORIGIN 且未开启 TRUST_PROXY：反向代理改写 Host 时，后台同源校验和表情绝对地址可能不正确。');
  }

  return { settings, warnings };
};
