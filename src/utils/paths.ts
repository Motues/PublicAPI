import { join, resolve } from 'node:path';
import process from 'node:process';

const resolveDir = (value: string | undefined, fallback: string): string => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? fallback : resolve(trimmed);
};

/** 数据目录（配置、统计、会话密钥）；可用 DATA_DIR 覆盖 */
export const DATA_DIR = resolveDir(process.env.DATA_DIR, join(process.cwd(), 'data'));

/** 运行时配置目录 */
export const CONFIG_DIR = join(DATA_DIR, 'config');

/** 调用统计目录 */
export const STATS_DIR = join(DATA_DIR, 'stats');

/** 静态资源目录；可用 PUBLIC_DIR 覆盖 */
export const PUBLIC_DIR = resolveDir(process.env.PUBLIC_DIR, join(process.cwd(), 'public'));
