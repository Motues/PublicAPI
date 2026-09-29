import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

const CACHE_DURATION = 5000; // 5秒缓存

export interface ServiceItem {
  name: string;
  url: string;
  status: 'open' | 'closed';
}

let serviceCache: ServiceItem[] | null = null;
let lastLoadTime_list: number = 0;
export function loadServices(): ServiceItem[] {
  const now = Date.now();

  if (serviceCache && (now - lastLoadTime_list) < CACHE_DURATION) {
    return serviceCache;
  }

  try {
    const configDir = join(process.cwd(), 'data', 'config');
    const configPath = join(configDir, 'services.json');

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    if (!existsSync(configPath)) {
      const defaultContent = '[]';
      writeFileSync(configPath, defaultContent, 'utf-8');
      logger.info('Created default services config file', 'Config');
    }

    const fileContent = readFileSync(configPath, 'utf-8');
    const services: ServiceItem[] = JSON.parse(fileContent);

    serviceCache = services;
    lastLoadTime_list = now;

    return services;
  } catch (error) {
    logger.error('Failed to load services config:', error, 'Config');
    return [];
  }
}

export interface SiteConfig {
  siteName: string;
  description: string[];
  footer: string;
}

let siteConfigCache: SiteConfig | null = null;
let lastLoadTime_site: number = 0;

const defaultConfig: SiteConfig = {
  siteName: 'Public API Server',
  description: ['A public API server for everyone.', 'Welcome to Public API Server'],
  footer: '系统运行良好，欢迎使用！'
};

export function loadSiteConfig(): SiteConfig {
  const now = Date.now();

  if (siteConfigCache && (now - lastLoadTime_site) < CACHE_DURATION) {
    return siteConfigCache;
  }

  try {
    const configDir = join(process.cwd(), 'data', 'config');
    const configPath = join(configDir, 'site.json');

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      logger.info('Created default site config file', 'Config');
      siteConfigCache = defaultConfig;
      lastLoadTime_site = now;
      return defaultConfig;
    }

    const fileContent = readFileSync(configPath, 'utf-8');
    const config: SiteConfig = JSON.parse(fileContent);

    siteConfigCache = {
      siteName: config.siteName || defaultConfig.siteName,
      description: Array.isArray(config.description) ? config.description : defaultConfig.description,
      footer: config.footer || defaultConfig.footer
    };
    lastLoadTime_site = now;

    return siteConfigCache;
  } catch (error) {
    logger.error('Failed to load site config:', error, 'Config');
    return defaultConfig;
  }
}

export interface MetingConfig {
  cookie?: string;
}

let metingCookieCache: MetingConfig | null = null;
let lastLoadTime_meting: number = 0;

const defaultMetingConfig: MetingConfig = {
  cookie: ''
};

export function loadMetingSettings(): MetingConfig {
  const now = Date.now();

  if (metingCookieCache && (now - lastLoadTime_meting) < CACHE_DURATION) {
    return metingCookieCache;
  }

  try {
    const configDir = join(process.cwd(), 'data', 'config');
    const configPath = join(configDir, 'meting.json');

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(defaultMetingConfig, null, 2), 'utf-8');
      logger.info('Created default meting config file', 'Config');
      metingCookieCache = defaultMetingConfig;
      lastLoadTime_meting = now;
      return defaultMetingConfig;
    }

    const fileContent = readFileSync(configPath, 'utf-8');
    const config: MetingConfig = JSON.parse(fileContent);

    metingCookieCache = {
      cookie: config.cookie || ''
    };
    lastLoadTime_meting = now;

    return metingCookieCache;
  } catch (error) {
    logger.error('Failed to load meting settings:', error, 'Config');
    return defaultMetingConfig;
  }
}

// ---------------------------------------------------------------------------
// 配置写入（管理后台 /admin 使用，保存后立即刷新内存缓存，无需重启）
// ---------------------------------------------------------------------------

/** 配置校验失败（对应 HTTP 400），与文件读写错误区分开 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

const LIMITS = {
  siteName: 100,
  descriptionItem: 200,
  descriptionCount: 50,
  footer: 300,
  serviceCount: 100,
  serviceName: 100,
  serviceUrl: 500,
  cookie: 8000,
} as const;

/** 获取（必要时创建）配置目录 */
const ensureConfigDir = (): string => {
  const configDir = join(process.cwd(), 'data', 'config');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  return configDir;
};

/** 原子写入 JSON 配置，避免写入中断损坏原文件 */
const writeJsonFile = (fileName: string, data: unknown): void => {
  const filePath = join(ensureConfigDir(), fileName);
  const tempPath = `${filePath}.tmp`;

  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  renameSync(tempPath, filePath);
};

/** 校验并规范化字符串字段 */
const requireString = (
  value: unknown,
  field: string,
  maxLength: number,
  allowEmpty = false
): string => {
  if (typeof value !== 'string') {
    throw new ConfigValidationError(`${field} 必须是字符串`);
  }

  const trimmed = value.trim();
  if (!allowEmpty && trimmed === '') {
    throw new ConfigValidationError(`${field} 不能为空`);
  }
  if (value.length > maxLength) {
    throw new ConfigValidationError(`${field} 长度不能超过 ${maxLength} 个字符`);
  }

  return trimmed;
};

/** 校验跳转链接，只允许 http(s) 或站内相对路径，避免 javascript: 等危险协议 */
const assertSafeUrl = (url: string, field: string): void => {
  if (url.startsWith('/') && !url.startsWith('//')) {
    return;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return;
    }
  } catch {
    // 交给下面统一抛错
  }

  throw new ConfigValidationError(`${field} 必须是 http(s) 链接或以 / 开头的站内路径`);
};

/**
 * 保存站点配置（site.json），写入成功后立即刷新缓存
 * @param input 站点配置字段，未提供的字段保持原值
 */
export function saveSiteConfig(input: {
  siteName?: unknown;
  description?: unknown;
  footer?: unknown;
}): SiteConfig {
  const current = loadSiteConfig();

  const siteName = input.siteName === undefined
    ? current.siteName
    : requireString(input.siteName, 'siteName', LIMITS.siteName);

  let description = current.description;
  if (input.description !== undefined) {
    if (!Array.isArray(input.description)) {
      throw new ConfigValidationError('description 必须是字符串数组');
    }
    if (input.description.length > LIMITS.descriptionCount) {
      throw new ConfigValidationError(`description 最多 ${LIMITS.descriptionCount} 条`);
    }

    description = input.description
      .map((item, index) => requireString(item, `description[${index}]`, LIMITS.descriptionItem))
      .filter((item) => item !== '');

    if (description.length === 0) {
      throw new ConfigValidationError('description 至少需要保留一条内容');
    }
  }

  const footer = input.footer === undefined
    ? current.footer
    : requireString(input.footer, 'footer', LIMITS.footer, true);

  const next: SiteConfig = { siteName, description, footer };
  writeJsonFile('site.json', next);

  siteConfigCache = next;
  lastLoadTime_site = Date.now();

  logger.info('Site config saved from admin panel', 'Config');
  return next;
}

/**
 * 保存服务目录（services.json），写入成功后立即刷新缓存
 * @param input 服务列表
 */
export function saveServices(input: unknown): ServiceItem[] {
  if (!Array.isArray(input)) {
    throw new ConfigValidationError('services 必须是数组');
  }
  if (input.length > LIMITS.serviceCount) {
    throw new ConfigValidationError(`services 最多 ${LIMITS.serviceCount} 项`);
  }

  const services: ServiceItem[] = input.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new ConfigValidationError(`services[${index}] 必须是对象`);
    }

    const item = raw as Record<string, unknown>;
    const name = requireString(item.name, `services[${index}].name`, LIMITS.serviceName);
    const url = requireString(item.url, `services[${index}].url`, LIMITS.serviceUrl);
    assertSafeUrl(url, `services[${index}].url`);

    if (item.status !== 'open' && item.status !== 'closed') {
      throw new ConfigValidationError(`services[${index}].status 只能是 open 或 closed`);
    }
    const status: ServiceItem['status'] = item.status === 'open' ? 'open' : 'closed';

    return { name, url, status };
  });

  writeJsonFile('services.json', services);

  serviceCache = services;
  lastLoadTime_list = Date.now();

  logger.info('Services config saved from admin panel', 'Config');
  return services;
}

/**
 * 保存音乐接口设置（meting.json），写入成功后立即刷新缓存
 * @param input 音乐设置字段，未提供的字段保持原值
 */
export function saveMetingSettings(input: { cookie?: unknown }): MetingConfig {
  const current = loadMetingSettings();

  const cookie = input.cookie === undefined
    ? current.cookie ?? ''
    : requireString(input.cookie, 'cookie', LIMITS.cookie, true).replace(/[\r\n]+/g, ' ');

  const next: MetingConfig = { cookie };
  writeJsonFile('meting.json', next);

  metingCookieCache = next;
  lastLoadTime_meting = Date.now();

  logger.info('Meting config saved from admin panel', 'Config');
  return next;
}
