import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';
import { defaultEmojiData } from './defaultEmoji.js';
import type { EmojiData, EmojiGroup, EmojiItem, EmojiType } from './defaultEmoji.js';

export type { EmojiData, EmojiGroup, EmojiItem, EmojiType } from './defaultEmoji.js';

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
  /** 表情接口对外访问地址（如 https://api.example.com），留空则按请求域名推导 */
  emojiBaseUrl: string;
}

let siteConfigCache: SiteConfig | null = null;
let lastLoadTime_site: number = 0;

const defaultConfig: SiteConfig = {
  siteName: 'Public API Server',
  description: ['A public API server for everyone.', 'Welcome to Public API Server'],
  footer: '系统运行良好，欢迎使用！',
  emojiBaseUrl: ''
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
      footer: config.footer || defaultConfig.footer,
      emojiBaseUrl: readEmojiBaseUrl(config.emojiBaseUrl)
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
// 表情数据（OwO 格式，供 /emoji/owo.json 与 Twikoo / Artalk 等前端使用）
// ---------------------------------------------------------------------------

let emojiDataCache: EmojiData | null = null;
let lastLoadTime_emoji = 0;

/**
 * 把内置默认数据里存在、但配置文件里缺失的分组补进去
 *
 * 升级镜像后内置表情包可能新增分组（如「小红书」），而 data/config/emoji.json 一旦生成就以它为准，
 * 这里在读取时补齐缺失分组，账号里的自定义调整不受影响。
 * 想彻底隐藏某个分组时，把它留在配置里并把 container 置空即可（空分组不会被当成缺失）。
 * @returns 本次补进来的分组名
 */
const mergeMissingEmojiGroups = (data: EmojiData): string[] => {
  const added: string[] = [];

  for (const [name, group] of Object.entries(defaultEmojiData)) {
    if (data[name]) continue;
    data[name] = group;
    added.push(name);
  }

  return added;
};

/**
 * 读取表情数据（data/config/emoji.json）
 *
 * 文件不存在时写入内置默认数据；文件存在于旧版本时自动补齐新增分组；
 * 文件损坏时回退到默认数据并记录日志，单个分组/表情项不合法时跳过该项，保证接口始终可用。
 */
export function loadEmojiData(): EmojiData {
  const now = Date.now();

  if (emojiDataCache && (now - lastLoadTime_emoji) < CACHE_DURATION) {
    return emojiDataCache;
  }

  try {
    const configDir = join(process.cwd(), 'data', 'config');
    const configPath = join(configDir, 'emoji.json');

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    if (!existsSync(configPath)) {
      writeFileSync(configPath, `${JSON.stringify(defaultEmojiData, null, 2)}\n`, 'utf-8');
      logger.info('Created default emoji config file', 'Config');
      emojiDataCache = defaultEmojiData;
      lastLoadTime_emoji = now;
      return defaultEmojiData;
    }

    const fileContent = readFileSync(configPath, 'utf-8');
    const data = parseEmojiData(JSON.parse(fileContent), false);

    // 旧版本留下的配置文件不含新内置分组时，读取后自动补齐并写回
    const added = mergeMissingEmojiGroups(data);
    if (added.length > 0) {
      try {
        writeJsonFile('emoji.json', data);
        logger.info(`Merged new emoji groups from built-in data: ${added.join(', ')}`, 'Config');
      } catch (writeError) {
        // 配置目录只读时仍然返回补齐后的数据，只是不落盘
        logger.warn(
          `Merged new emoji groups in memory only (write failed): ${(writeError as Error).message}`,
          'Config'
        );
      }
    }

    emojiDataCache = data;
    lastLoadTime_emoji = now;

    return data;
  } catch (error) {
    logger.error('Failed to load emoji config:', error, 'Config');
    return defaultEmojiData;
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
  emojiBaseUrl: 500,
  serviceCount: 100,
  serviceName: 100,
  serviceUrl: 500,
  cookie: 8000,
  emojiGroupCount: 50,
  emojiGroupName: 50,
  emojiItemCount: 1000, // 单个分组的表情数量
  emojiTotalCount: 5000, // 全部分组的表情数量
  emojiIcon: 2000,
  emojiText: 200,
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
 * 规范化表情接口对外访问地址
 *
 * 留空表示按请求域名自动推导；非空时必须是 http(s) 的站点根地址，
 * 末尾的 / 会被去掉（接口拼接时统一使用 `/static/...`）。
 */
const normalizeEmojiBaseUrl = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new ConfigValidationError('emojiBaseUrl 必须是字符串');
  }

  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed === '') {
    return '';
  }
  if (trimmed.length > LIMITS.emojiBaseUrl) {
    throw new ConfigValidationError(`emojiBaseUrl 长度不能超过 ${LIMITS.emojiBaseUrl} 个字符`);
  }

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.username === '' &&
      parsed.password === ''
    ) {
      return trimmed;
    }
  } catch {
    // 交给下面统一抛错
  }

  throw new ConfigValidationError('emojiBaseUrl 必须是形如 https://api.example.com 的站点根地址（不能包含路径、查询参数或用户信息）');
};

/** 读取配置文件时的宽松解析：地址非法时按未配置处理并记录日志，保证服务可用 */
const readEmojiBaseUrl = (value: unknown): string => {
  try {
    return normalizeEmojiBaseUrl(value ?? '');
  } catch (error) {
    logger.warn(`Invalid emojiBaseUrl in site config, treated as empty: ${(error as Error).message}`, 'Config');
    return '';
  }
};

/**
 * 保存站点配置（site.json），写入成功后立即刷新缓存
 * @param input 站点配置字段，未提供的字段保持原值
 */
export function saveSiteConfig(input: {
  siteName?: unknown;
  description?: unknown;
  footer?: unknown;
  emojiBaseUrl?: unknown;
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

  const emojiBaseUrl = input.emojiBaseUrl === undefined
    ? current.emojiBaseUrl
    : normalizeEmojiBaseUrl(input.emojiBaseUrl);

  const next: SiteConfig = { siteName, description, footer, emojiBaseUrl };
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

// ---------------------------------------------------------------------------
// 表情数据：解析与校验
// ---------------------------------------------------------------------------

/** 图片表情必须是单个安全的 <img> 标签，避免把危险 HTML 输出到使用方页面 */
const EMOJI_IMG_PATTERN = /^<img\s+src=["']([^"']+)["']\s*\/?>$/i;

/** 校验图片表情的 icon 结构，文本表情不做限制 */
const assertEmojiIcon = (icon: string, field: string, type: EmojiType): void => {
  if (type !== 'image') {
    return;
  }

  const matched = EMOJI_IMG_PATTERN.exec(icon);
  if (!matched) {
    throw new ConfigValidationError(`${field} 必须是形如 <img src="..."> 的图片标签`);
  }

  assertSafeUrl(matched[1], field);
};

/** 解析单个表情项 */
const parseEmojiItem = (raw: unknown, field: string, type: EmojiType): EmojiItem => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigValidationError(`${field} 必须是对象`);
  }

  const item = raw as Record<string, unknown>;
  const icon = requireString(item.icon, `${field}.icon`, LIMITS.emojiIcon);
  const text = item.text === undefined || item.text === null
    ? ''
    : requireString(item.text, `${field}.text`, LIMITS.emojiText, true);

  assertEmojiIcon(icon, `${field}.icon`, type);

  return { icon, text };
};

/** 解析单个表情分组 */
const parseEmojiGroup = (raw: unknown, field: string): EmojiGroup => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigValidationError(`${field} 必须是对象`);
  }

  const group = raw as Record<string, unknown>;
  if (group.type !== 'emoticon' && group.type !== 'emoji' && group.type !== 'image') {
    throw new ConfigValidationError(`${field}.type 只能是 emoticon、emoji 或 image`);
  }
  if (!Array.isArray(group.container)) {
    throw new ConfigValidationError(`${field}.container 必须是数组`);
  }
  if (group.container.length > LIMITS.emojiItemCount) {
    throw new ConfigValidationError(`${field}.container 最多 ${LIMITS.emojiItemCount} 项`);
  }

  const container = group.container.map((item, index) =>
    parseEmojiItem(item, `${field}.container[${index}]`, group.type as EmojiType)
  );

  return { type: group.type as EmojiType, container };
};

/**
 * 解析表情数据
 * @param input 待解析数据，形如 { "分组名": { type, container } }
 * @param strict 严格模式（保存时使用）遇到非法内容直接抛错；宽松模式（读取文件时使用）跳过非法分组
 */
const parseEmojiData = (input: unknown, strict: boolean): EmojiData => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ConfigValidationError('表情数据必须是对象，形如 { "分组名": { "type": "emoji", "container": [] } }');
  }

  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > LIMITS.emojiGroupCount) {
    throw new ConfigValidationError(`表情分组最多 ${LIMITS.emojiGroupCount} 组`);
  }

  const data: EmojiData = {};
  let total = 0;

  for (const [rawName, rawGroup] of entries) {
    const name = rawName.trim();
    const field = `emoji[${JSON.stringify(rawName)}]`;

    try {
      if (name === '' || name.length > LIMITS.emojiGroupName) {
        throw new ConfigValidationError(`分组名不能为空且长度不能超过 ${LIMITS.emojiGroupName} 个字符`);
      }

      const group = parseEmojiGroup(rawGroup, field);
      data[name] = group;
      total += group.container.length;
    } catch (error) {
      if (strict) {
        throw error;
      }
      logger.warn(`Skipped invalid emoji group ${field}: ${(error as Error).message}`, 'Config');
    }
  }

  if (total > LIMITS.emojiTotalCount) {
    throw new ConfigValidationError(`表情总数不能超过 ${LIMITS.emojiTotalCount} 个`);
  }

  return data;
};

/**
 * 保存表情数据（emoji.json），写入成功后立即刷新缓存
 * @param input OwO 格式表情数据，图片表情的 icon 需为安全的 <img> 标签
 */
export function saveEmojiData(input: unknown): EmojiData {
  const next = parseEmojiData(input, true);

  writeJsonFile('emoji.json', next);

  emojiDataCache = next;
  lastLoadTime_emoji = Date.now();

  logger.info('Emoji config saved from admin panel', 'Config');
  return next;
}
