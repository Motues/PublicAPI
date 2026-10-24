/**
 * 同步表情资源到 public/emoji/ 目录，并生成内置默认数据 src/utils/defaultEmoji.ts
 *
 * 三个数据来源：
 *   1. OwO 数据（默认 https://owo.imaegoo.com/owo.json）：颜文字 / Emoji（Bilibili 小电视分组已排除）
 *   2. scripts/emoji-extra.json：额外的文本表情（按分组补充，默认追加到 Emoji 组）
 *   3. Waline 表情包（官方 @waline/emojis、社区 fork @ljxme/walineqaq、小红书贴纸包 red-sticker，均带 info.json 清单）
 *
 * 表情包通过 npm registry 的 tarball 一次性取回（快且不易被 CDN 限流），
 * 图片落盘到 public/emoji/ 后随仓库发布，运行时由 /static/emoji/... 静态托管，不再访问上游。
 *
 * 用法：
 *   node scripts/sync-emoji-assets.mjs                      # 同步全部图片分组（已存在则跳过）
 *   node scripts/sync-emoji-assets.mjs --force              # 覆盖已存在的文件
 *   node scripts/sync-emoji-assets.mjs --emit-ts            # 同时重新生成 src/utils/defaultEmoji.ts
 *   node scripts/sync-emoji-assets.mjs --emit-ts --update-data
 *                                                           # 并把新增分组/表情合并进 data/config/emoji.json，
 *                                                           # 同时清理该文件中图片已被删除的表情项
 *   node scripts/sync-emoji-assets.mjs --group QQ            # 只处理指定分组（OwO 分组名或表情包目录名）
 *   node scripts/sync-emoji-assets.mjs --record-missing     # 把磁盘上已删除的图片记入排除清单（不再同步回来）
 *   node scripts/sync-emoji-assets.mjs --reset-data         # 用内置默认数据重建 data/config/emoji.json（覆盖手工修改）
 *
 * 说明：手动删除 public/emoji/ 下的图片后，运行 --record-missing 会把它们写入
 * scripts/emoji-exclude.json，之后的同步不会再下载，也不会出现在接口数据里。
 * 排除清单以「表情名」（即接口返回的 text）为准，同时也兼容旧的文件名条目。
 *
 * 表情包可配置 hashNames: true，此时图片按内容 SHA-1 命名（如 6ea59c…e24.png），
 * 便于与上游原始命名解耦；text 仍保留可读的表情名。
 */
import { mkdir, writeFile, readFile, access, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import process from 'node:process';

/** OwO 数据源 */
const OWO_SOURCE = process.env.EMOJI_SOURCE || 'https://owo.imaegoo.com/owo.json';

/** 不生成也不下载的 OwO 分组（Bilibili 小电视已由 Bilibili 小黄脸替代） */
const EXCLUDE_OWO_GROUPS = new Set(['Bilibili']);

/** 表情包来源（npm tarball），包内均提供 <pack>/info.json 清单 */
const PACK_SOURCES = {
  waline: 'https://registry.npmjs.org/@waline/emojis/-/emojis-1.4.0.tgz',
  walineqaq: 'https://registry.npmjs.org/@ljxme/walineqaq/-/walineqaq-1.1.3.tgz',
  redsticker: 'https://registry.npmjs.org/red-sticker/-/red-sticker-2024.9.5.tgz',
};

/**
 * 要同步的图片表情包
 * - group：输出到接口的分组名
 * - slug：public/emoji/<slug>/ 目录名，也是 /static/emoji/<slug>/ 的访问路径
 * - hashNames：图片按内容 SHA-1 命名（true 时不再使用上游文件名）
 * - textPrefix：展示用表情名需要去掉的上游前缀（如小红书包的「小红书-」）
 */
const WALINE_PACKS = [
  { source: 'waline', pack: 'bilibili', group: 'Bilibili', slug: 'bilibili', hashNames: true },
  { source: 'waline', pack: 'qq', group: 'QQ', slug: 'qq', hashNames: true },
  { source: 'walineqaq', pack: 'heybox_cube', group: '小黑盒', slug: 'heybox', hashNames: true },
  { source: 'redsticker', pack: 'sticker', group: '小红书', slug: 'xiaohongshu', hashNames: true, textPrefix: '小红书-' },
];

const OUTPUT_ROOT = path.join(process.cwd(), 'public', 'emoji');
const EXTRA_FILE = path.join(process.cwd(), 'scripts', 'emoji-extra.json');
const EXCLUDE_FILE = path.join(process.cwd(), 'scripts', 'emoji-exclude.json');
const DEFAULT_TS = path.join(process.cwd(), 'src', 'utils', 'defaultEmoji.ts');
const DATA_FILE = path.join(process.cwd(), 'data', 'config', 'emoji.json');

const args = process.argv.slice(2);
const force = args.includes('--force');
const emitTs = args.includes('--emit-ts');
const updateData = args.includes('--update-data');
const resetData = args.includes('--reset-data');
const recordMissingFlag = args.includes('--record-missing');
const groupIndex = args.indexOf('--group');
const onlyGroup = groupIndex >= 0 ? args[groupIndex + 1] : null;

/** 排除清单：分组名 -> 文件名列表（已删除、不再同步的表情） */
const exclusion = { data: {}, dirty: false };

const exists = async (filePath) => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/** 分组名 / 目录名转 slug（图片包的目录名在 WALINE_PACKS 中显式指定） */
const toSlug = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'group';

/** 从 <img src="..."> 中取出图片地址 */
const extractSrc = (icon) => {
  const matched = /<img[^>]*\ssrc=["']([^"']+)["']/i.exec(icon);
  return matched ? matched[1] : null;
};

/** 图片项对应的本地文件路径（非 /static/ 站内地址返回 null） */
const localFilePath = (icon) => {
  const src = extractSrc(String(icon ?? ''));
  if (!src) return null;
  const matched = /(?:^https?:\/\/[^/]+)?\/static\/(.+)$/i.exec(src);
  return matched ? path.join(process.cwd(), 'public', decodeURIComponent(matched[1])) : null;
};

/** 站内图片地址（文件名做 URL 编码，兼容中文文件名） */
const localIcon = (slug, fileName) => `<img src="/static/emoji/${slug}/${encodeURIComponent(fileName)}">`;

/** 该表情是否已被排除（按表情名匹配，兼容旧的文件名条目） */
const isExcluded = (groupName, itemName, fileName) => {
  const list = exclusion.data[groupName] || [];
  return list.includes(itemName) || list.includes(fileName);
};

/** 读取排除清单 */
const loadExclusions = async () => {
  if (!(await exists(EXCLUDE_FILE))) {
    return {};
  }
  try {
    return JSON.parse(await readFile(EXCLUDE_FILE, 'utf-8'));
  } catch (error) {
    console.warn(`[Emoji] 解析 scripts/emoji-exclude.json 失败，已忽略：${error.message}`);
    return {};
  }
};

/**
 * 把磁盘上已删除的表情记入排除清单（按表情名记录）
 * 分组目录不存在或为空时视为「尚未同步」，不做记录（避免在全新克隆上误判）
 */
const recordMissing = async (groupName, dir, inventory) => {
  if (!(await exists(dir))) {
    return 0;
  }

  const onDisk = await readdir(dir);
  if (onDisk.length === 0) {
    return 0;
  }

  const present = new Set(onDisk);
  const list = exclusion.data[groupName] || [];
  let added = 0;

  for (const { text, fileName } of inventory) {
    if (!fileName || !text) continue;
    if (present.has(fileName) || list.includes(text)) continue;
    list.push(text);
    added++;
  }

  // 只有确实记录了删除项才把该分组写进排除清单，避免留下空数组
  if (added > 0) {
    exclusion.data[groupName] = list;
    list.sort();
    exclusion.dirty = true;
  }

  return added;
};

/** 写回排除清单 */
const saveExclusions = async () => {
  if (!exclusion.dirty) {
    return;
  }

  const sorted = {};
  for (const key of Object.keys(exclusion.data).sort()) {
    sorted[key] = [...exclusion.data[key]].sort();
  }

  await writeFile(EXCLUDE_FILE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
  console.log('[Emoji] 已更新 scripts/emoji-exclude.json');
};

/** 归一化文本表情：运行时写入会 trim，这里保持一致，避免同一条表情因空格差异被重复追加 */
const textItem = (icon, text) => ({ icon: String(icon ?? '').trim(), text: String(text ?? '').trim() });

/** 带超时与重试的下载，必要时回退到 unpkg */
const fetchBuffer = async (url, label) => {
  const candidates = [url];
  if (url.startsWith('https://cdn.jsdelivr.net/npm/')) {
    candidates.push(`https://unpkg.com/${url.slice('https://cdn.jsdelivr.net/npm/'.length)}`);
  }

  let lastError = null;
  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(candidate, { signal: AbortSignal.timeout(60000) });
        if (response.ok) {
          return Buffer.from(await response.arrayBuffer());
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }

  throw new Error(`下载失败 ${label}: ${lastError && lastError.message}`);
};

const fetchJson = async (url, label) => JSON.parse((await fetchBuffer(url, label)).toString('utf-8'));

/**
 * 极简 tar 解析（npm tarball 为 ustar 格式，路径以 package/ 开头）
 * 仅处理普通文件，长文件名（pax/GNU 扩展头）与符号链接会被忽略
 */
const extractTarEntries = (tarball) => {
  const buffer = gunzipSync(tarball);
  const entries = new Map();

  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break; // 结束块
    }

    const rawName = header.subarray(0, 100).toString('utf-8').replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString('utf-8').replace(/\0.*$/, '').trim(), 8) || 0;
    const typeFlag = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;

    if (typeFlag === '0' || typeFlag === '\0') {
      entries.set(rawName, buffer.subarray(dataStart, dataStart + size));
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return entries;
};

/** 取回并解析表情包 tarball，按来源缓存 */
const tarballCache = new Map();
const loadTarball = async (sourceKey) => {
  if (tarballCache.has(sourceKey)) {
    return tarballCache.get(sourceKey);
  }

  const url = PACK_SOURCES[sourceKey];
  if (!url) {
    throw new Error(`未知的表情包来源：${sourceKey}`);
  }

  console.log(`[Emoji] 下载表情包：${url}`);
  const entries = extractTarEntries(await fetchBuffer(url, url));
  tarballCache.set(sourceKey, entries);
  return entries;
};

/** 生成 TS 字面量：优先单引号，含引号/换行时退回 JSON 转义 */
const tsString = (value) => {
  const text = String(value);
  if (!text.includes("'") && !text.includes('\\') && !/[\r\n\u2028\u2029]/.test(text)) {
    return `'${text}'`;
  }
  return JSON.stringify(text);
};

/** 按文件头判断图片真实格式（上游偶有扩展名与实际格式不一致的图，如 webp 存成 .png） */
const detectImageExt = (data) => {
  if (!data || data.length < 12) return null;
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'gif';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
};

/** 从表情包 tarball 中落盘一个分组，返回分组数据 */
const syncPack = async (config) => {
  const entries = await loadTarball(config.source);
  const prefixPath = `package/${config.pack}/`;
  const infoEntry = entries.get(`${prefixPath}info.json`);

  if (!infoEntry) {
    throw new Error(`表情包 ${config.pack} 缺少 info.json`);
  }

  const info = JSON.parse(infoEntry.toString('utf-8'));
  const dir = path.join(OUTPUT_ROOT, config.slug);
  await mkdir(dir, { recursive: true });

  const extension = `.${info.type || 'png'}`;

  /** 每项表情：来源文件名、包内数据、最终落盘文件名（配置 hashNames 时按内容 SHA-1）、展示名 */
  const inventory = (info.items || []).map((item) => {
    const text = String(item).trim();
    const sourceName = `${info.prefix || ''}${text}${extension}`;
    const data = entries.get(`${prefixPath}${sourceName}`);
    // 文件名按内容哈希时，扩展名改用真实图片格式，避免 content-type 与内容不符
    const fileExt = detectImageExt(data);

    return {
      text: config.textPrefix && text.startsWith(config.textPrefix)
        ? text.slice(config.textPrefix.length)
        : text,
      sourceName,
      data,
      fileName: data && config.hashNames
        ? `${createHash('sha1').update(data).digest('hex')}${fileExt ? `.${fileExt}` : extension}`
        : sourceName,
    };
  });

  if (recordMissingFlag) {
    const recorded = await recordMissing(config.group, dir, inventory);
    if (recorded > 0) {
      console.log(`[Emoji] ${config.group}：记录 ${recorded} 个已删除的表情（此后不再同步）`);
    }
  }

  const container = [];
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let excluded = 0;

  for (const entry of inventory) {
    if (isExcluded(config.group, entry.text, entry.fileName)) {
      excluded++;
      continue;
    }

    if (!entry.data) {
      failed++;
      console.warn(`[Emoji] 跳过 ${config.group}/${entry.sourceName}：包内不存在`);
      continue;
    }

    const target = path.join(dir, entry.fileName);

    try {
      if (!force && (await exists(target))) {
        skipped++;
      } else {
        await writeFile(target, entry.data);
        downloaded++;
      }
      container.push({ icon: localIcon(config.slug, entry.fileName), text: entry.text });
    } catch (error) {
      failed++;
      console.warn(`[Emoji] 跳过 ${config.group}/${entry.fileName}：${error.message}`);
    }
  }

  // 文件名改为哈希后，清理目录里遗留的旧文件
  if (config.hashNames) {
    const expected = new Set(inventory.filter((entry) => entry.data).map((entry) => entry.fileName));
    let removed = 0;

    for (const existing of await readdir(dir)) {
      if (expected.has(existing)) continue;
      await rm(path.join(dir, existing));
      removed++;
    }

    if (removed > 0) {
      console.log(`[Emoji] ${config.group}：清理 ${removed} 个旧文件（文件名已改为哈希）`);
    }
  }

  console.log(
    `[Emoji] ${config.group}：新增 ${downloaded}，跳过 ${skipped}` +
    `${excluded ? `，已排除 ${excluded}` : ''}${failed ? `，失败 ${failed}` : ''}，共 ${container.length} 张 -> public/emoji/${config.slug}/`
  );

  return { group: config.group, container };
};

/** 下载 OwO 数据中的图片分组（Exclude 列表之外的分组），并返回改写为站内地址后的数据 */
const syncOwoImages = async (data) => {
  const result = {};

  for (const [name, group] of Object.entries(data)) {
    if (EXCLUDE_OWO_GROUPS.has(name)) {
      console.log(`[Emoji] 已排除 OwO 分组：${name}`);
      continue;
    }

    const slug = toSlug(name);

    // 文本表情直接沿用（归一化 icon/text 前后的空白）
    if (group.type !== 'image') {
      result[name] = {
        type: group.type,
        container: group.container.map((item) => textItem(item.icon, item.text)),
      };
      continue;
    }

    // 未指定该分组时不做下载，但仍按站内路径生成数据（文件此前已同步过）
    if (onlyGroup && onlyGroup !== name) {
      result[name] = {
        type: 'image',
        container: group.container.map((item) => {
          const src = extractSrc(String(item.icon ?? ''));
          if (!src) return textItem(item.icon, item.text);
          const fileName = path.basename(new URL(src, OWO_SOURCE).pathname);
          return { icon: localIcon(slug, fileName), text: String(item.text ?? '').trim() };
        }),
      };
      continue;
    }

    const dir = path.join(OUTPUT_ROOT, slug);
    await mkdir(dir, { recursive: true });

    const inventory = group.container.map((item) => {
      const src = extractSrc(String(item.icon ?? ''));
      return { item, fileName: src ? path.basename(new URL(src, OWO_SOURCE).pathname) : null };
    });

    if (recordMissingFlag) {
      const recorded = await recordMissing(name, dir, inventory.map((entry) => ({ text: String(entry.item.text ?? '').trim(), fileName: entry.fileName })));
      if (recorded > 0) {
        console.log(`[Emoji] ${name}：记录 ${recorded} 个已删除的表情（此后不再同步）`);
      }
    }

    const container = [];
    let downloaded = 0;
    let skipped = 0;
    let excluded = 0;
    let failed = 0;

    for (const { item, fileName } of inventory) {
      if (!fileName) {
        console.warn(`[Emoji] 跳过无法解析的图标：${item.text}`);
        continue;
      }
      if (isExcluded(name, String(item.text ?? '').trim(), fileName)) {
        excluded++;
        continue;
      }

      const src = extractSrc(String(item.icon ?? ''));
      const target = path.join(dir, fileName);

      try {
        if (!force && (await exists(target))) {
          skipped++;
        } else {
          await writeFile(target, await fetchBuffer(src, fileName));
          downloaded++;
        }
        container.push({ icon: localIcon(slug, fileName), text: String(item.text ?? '').trim() });
      } catch (error) {
        failed++;
        console.warn(`[Emoji] 跳过 ${name}/${fileName}：${error.message}`);
      }
    }

    console.log(
      `[Emoji] ${name}：新增 ${downloaded}，跳过 ${skipped}` +
      `${excluded ? `，已排除 ${excluded}` : ''}${failed ? `，失败 ${failed}` : ''} -> public/emoji/${slug}/`
    );
    result[name] = { type: 'image', container };
  }

  return result;
};

/**
 * 清理指向不存在文件的图片项（用户手工删图后保证 JSON 与磁盘一致）
 * 图片分组被清空时连同分组一起移除
 */
const pruneMissingImages = async (data, label) => {
  const removed = [];
  const emptied = [];

  for (const [name, group] of Object.entries(data)) {
    if (group.type !== 'image') continue;

    const kept = [];
    for (const item of group.container) {
      const filePath = localFilePath(item.icon);
      if (filePath && !(await exists(filePath))) {
        removed.push(`${name}/${item.text || path.basename(filePath)}`);
        continue;
      }
      kept.push(item);
    }

    group.container = kept;
    if (kept.length === 0) {
      delete data[name];
      emptied.push(name);
    }
  }

  if (removed.length > 0) {
    const samples = removed.slice(0, 6).join('、');
    console.log(
      `[Emoji] ${label}：移除 ${removed.length} 项（图片文件不存在）${removed.length > 6 ? `，例如 ${samples} 等` : `：${samples}`}`
    );
  }
  if (emptied.length > 0) {
    console.log(`[Emoji] ${label}：移除空分组 ${emptied.join('、')}`);
  }

  return removed.length;
};

/** 合并 scripts/emoji-extra.json 中的文本表情 */
const mergeExtra = (data, extra) => {
  for (const [name, items] of Object.entries(extra)) {
    if (!Array.isArray(items)) continue;

    const target = data[name] || (data[name] = { type: 'emoji', container: [] });
    const known = new Set(target.container.map((item) => item.icon));

    for (const item of items) {
      if (!item || typeof item.icon !== 'string' || known.has(item.icon)) continue;
      const normalized = textItem(item.icon, item.text);
      if (known.has(normalized.icon)) continue;
      target.container.push(normalized);
      known.add(normalized.icon);
    }
  }

  return data;
};

/** 生成 src/utils/defaultEmoji.ts */
const emitDefaultTs = async (data) => {
  const lines = [
    '/**',
    ' * 内置默认表情数据（OwO 格式，兼容 Twikoo / Artalk / Waline）',
    ' *',
    ' * 首次启动时由 dataLoader 写入 data/config/emoji.json，之后以该文件为准；',
    ' * type=image 的 icon 使用站内相对路径 /static/emoji/<分组目录>/<文件名>，',
    ' * 接口返回时会按请求域名补全为绝对地址（见 emojiController.ts）。',
    ' *',
    ' * 图片资源位于 public/emoji/，由 scripts/sync-emoji-assets.mjs --emit-ts 生成，请勿手工编辑。',
    ' */',
    '',
    "export type EmojiType = 'emoticon' | 'emoji' | 'image';",
    '',
    'export interface EmojiItem {',
    '  /** 表情本体：文本表情为字符，图片表情为 <img> 标签 */',
    '  icon: string;',
    '  /** 表情说明 / 快捷提示 */',
    '  text: string;',
    '}',
    '',
    'export interface EmojiGroup {',
    '  type: EmojiType;',
    '  container: EmojiItem[];',
    '}',
    '',
    'export type EmojiData = Record<string, EmojiGroup>;',
    '',
    'export const defaultEmojiData: EmojiData = {',
  ];

  for (const [groupName, group] of Object.entries(data)) {
    lines.push(`  ${tsString(groupName)}: {`);
    lines.push(`    type: ${tsString(group.type)},`);

    if (!Array.isArray(group.container) || group.container.length === 0) {
      lines.push('    container: [],');
      lines.push('  },');
      continue;
    }

    lines.push('    container: [');
    for (const item of group.container) {
      lines.push(`      { icon: ${tsString(item.icon)}, text: ${tsString(item.text ?? '')} },`);
    }
    lines.push('    ],');
    lines.push('  },');
  }

  lines.push('};', '');

  await writeFile(DEFAULT_TS, lines.join('\n'), 'utf-8');
  console.log('[Emoji] 已生成内置默认数据: src/utils/defaultEmoji.ts');
};

/**
 * 把内置默认数据合并进 data/config/emoji.json
 * 做三件事：补齐缺失分组、补充缺失表情、清理已删除图片对应的表情项
 * 不会覆盖已有分组与已有表情项
 */
const updateDataFile = async (data) => {
  let current = {};
  if (await exists(DATA_FILE)) {
    current = JSON.parse(await readFile(DATA_FILE, 'utf-8'));
  }

  const merged = { ...current };

  const changed = [];
  for (const [name, group] of Object.entries(data)) {
    if (!merged[name]) {
      merged[name] = group;
      changed.push(`${name}(${group.container.length})`);
      continue;
    }

    const target = merged[name];
    const known = new Set(target.container.map((item) => item.icon));
    let appended = 0;
    for (const item of group.container) {
      if (known.has(item.icon)) continue;
      target.container.push(item);
      known.add(item.icon);
      appended++;
    }
    if (appended > 0) changed.push(`${name}(+${appended})`);
  }

  // 清理指向已删除图片的表情项（含当前数据文件里已有的历史项）
  await pruneMissingImages(merged, 'data/config/emoji.json');

  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8');
  console.log(`[Emoji] 已合并进 data/config/emoji.json：${changed.length ? changed.join('、') : '无新增'}`);
};

/** 用内置默认数据重建 data/config/emoji.json（会覆盖手工修改） */
const resetDataFile = async (data) => {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  console.log('[Emoji] 已用内置默认数据重建 data/config/emoji.json（覆盖）');
};

const main = async () => {
  exclusion.data = await loadExclusions();

  console.log(`[Emoji] 读取 OwO 数据: ${OWO_SOURCE}`);
  const data = await syncOwoImages(await fetchJson(OWO_SOURCE, 'owo.json'));

  for (const config of WALINE_PACKS) {
    if (onlyGroup && onlyGroup !== config.group && onlyGroup !== config.pack && onlyGroup !== config.slug) {
      continue;
    }
    const { group, container } = await syncPack(config);
    data[group] = { type: 'image', container };
  }

  const extra = await (async () => {
    if (!(await exists(EXTRA_FILE))) {
      return {};
    }
    try {
      return JSON.parse(await readFile(EXTRA_FILE, 'utf-8'));
    } catch (error) {
      console.warn(`[Emoji] 解析 scripts/emoji-extra.json 失败，已忽略：${error.message}`);
      return {};
    }
  })();
  mergeExtra(data, extra);

  // 磁盘上已不存在的图片不写进数据（用户手工删图后保持一致）
  await pruneMissingImages(data, '默认数据');

  const total = Object.values(data).reduce((sum, group) => sum + group.container.length, 0);
  console.log(`[Emoji] 汇总：${Object.keys(data).length} 组 / ${total} 个表情`);

  if (emitTs) {
    await emitDefaultTs(data);
  }
  if (resetData) {
    await resetDataFile(data);
  } else if (updateData) {
    await updateDataFile(data);
  }

  await saveExclusions();

  if (!emitTs && !updateData && !resetData) {
    console.log('[Emoji] 提示：--emit-ts 重新生成内置默认数据，--update-data 增量合并进 data/config/emoji.json，--reset-data 覆盖重建');
  }
};

await main();
