import type { Context, Next } from 'hono';
import storage from 'node-persist';
import { logger } from '../logger.js';
import { STATS_DIR } from '../paths.js';

// 初始化存储
await storage.init({
  dir: STATS_DIR, // 数据保存目录
  forgiveParseErrors: true,
});

/** 端点分布按日保留的天数（dailyStats 的按日趋势不设上限） */
const ENDPOINT_RETENTION_DAYS = 90;
/** QPS / 近一分钟调用量的滑动窗口 */
const QPS_WINDOW_MS = 60 * 1000;
/** 滑动窗口最多保留的请求时间戳，防止异常流量撑爆内存 */
const QPS_MAX_SAMPLES = 50000;

/** 按上海时区生成 YYYY-MM-DD 日期键 */
const dateKey = (date: Date = new Date()): string =>
  date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

// 内存聚合，避免竞态条件和频繁磁盘写入
let dailyStats: Record<string, number> = await storage.getItem('dailyStats') || {};
// 根据 dailyStats 重新计算 totalCount，保证两者一致
let totalCount = Object.values(dailyStats).reduce((sum, v) => sum + v, 0);
// 端点分布：{ 'YYYY-MM-DD': { music: 12, avatar: 3 } }
let endpointStats: Record<string, Record<string, number>> = await storage.getItem('endpointStats') || {};

// 最近一分钟的请求时间戳（用起始下标代替频繁 shift）
let recentHits: number[] = [];
let recentStart = 0;

/** 丢弃端点分布中超过保留期的日期 */
const pruneEndpointStats = (): void => {
  const keys = Object.keys(endpointStats).sort();
  if (keys.length <= ENDPOINT_RETENTION_DAYS) return;

  keys.slice(0, keys.length - ENDPOINT_RETENTION_DAYS).forEach((key) => {
    delete endpointStats[key];
  });
};

pruneEndpointStats();

/** 丢弃滑动窗口外的请求时间戳 */
const pruneRecentHits = (cutoff: number): void => {
  while (recentStart < recentHits.length && recentHits[recentStart] <= cutoff) {
    recentStart += 1;
  }

  // 回收前缀空间，避免数组无限增长
  if (recentStart > 4096) {
    recentHits = recentHits.slice(recentStart);
    recentStart = 0;
  }

  if (recentHits.length - recentStart > QPS_MAX_SAMPLES) {
    recentStart = recentHits.length - QPS_MAX_SAMPLES;
  }
};

/** 从请求路径解析端点名称，例如 /music/search -> music */
const endpointFromPath = (path: string): string => {
  const segment = path.split('/').find((part) => part !== '');
  return segment || 'other';
};

/** 把内存统计写入磁盘 */
export const flushStats = async (): Promise<void> => {
  await Promise.all([
    storage.setItem('totalCount', totalCount),
    storage.setItem('dailyStats', dailyStats),
    storage.setItem('endpointStats', endpointStats),
  ]);
};

// 定期刷新到磁盘（每 5 秒）；unref 避免测试/脚本被定时器挂住
const flushTimer = setInterval(async () => {
  try {
    await flushStats();
  } catch (e) {
    logger.error('Failed to flush stats to disk:', e, 'Counter');
  }
}, 5000);
flushTimer.unref?.();

/** 停止定时刷新并立即落盘，供 HTTP server 优雅退出时调用 */
export const shutdownStats = async (): Promise<void> => {
  clearInterval(flushTimer);
  try {
    await flushStats();
    logger.info('Stats saved successfully', 'Counter');
  } catch (e) {
    logger.error('Failed to save stats on shutdown:', e, 'Counter');
  }
};

export const counterMiddleware = async (c: Context, next: Next) => {
  const today = dateKey();

  totalCount++;
  if (!dailyStats[today]) {
    dailyStats[today] = 0;
  }
  dailyStats[today]++;

  const endpoint = endpointFromPath(new URL(c.req.url).pathname);
  if (!endpointStats[today]) {
    endpointStats[today] = {};
  }
  endpointStats[today][endpoint] = (endpointStats[today][endpoint] || 0) + 1;
  pruneEndpointStats();

  const now = Date.now();
  recentHits.push(now);
  pruneRecentHits(now - QPS_WINDOW_MS);

  c.set('stats', {
    total: totalCount,
    today: dailyStats[today],
    endpoint,
  });

  await next();
};

export const getStats = async () => {
  const today = dateKey();
  return {
    total: totalCount,
    today: dailyStats[today] || 0,
  };
};

/** 单个端点在统计区间内的调用量 */
export interface AnalyticsEndpoint {
  /** 端点名称，例如 music / avatar / emoji */
  name: string;
  /** 区间内调用量（仅统计开始记录端点分布之后的数据） */
  count: number;
  /** 今日调用量 */
  today: number;
  /** 占区间端点调用总量的比例（0-1） */
  share: number;
}

/** 调用分析聚合结果 */
export interface AnalyticsResult {
  days: number;
  generatedAt: string;
  total: number;
  today: number;
  rangeTotal: number;
  lastMinute: number;
  qps: number;
  uptimeSeconds: number;
  daily: Array<{ date: string; count: number }>;
  endpoints: AnalyticsEndpoint[];
}

/**
 * 聚合调用分析数据。
 *
 * `daily` 基于每日总调用量（历史数据完整），`endpoints` 基于端点分布，
 * 后者仅在本次版本上线后开始累积，最多保留 ENDPOINT_RETENTION_DAYS 天。
 */
export const getAnalytics = (days: number = 30): AnalyticsResult => {
  const safeDays = Math.min(Math.max(Math.floor(days) || 30, 1), ENDPOINT_RETENTION_DAYS);
  const now = Date.now();
  const dates: string[] = [];

  for (let i = safeDays - 1; i >= 0; i -= 1) {
    dates.push(dateKey(new Date(now - i * 24 * 60 * 60 * 1000)));
  }

  const daily = dates.map((date) => ({ date, count: dailyStats[date] || 0 }));
  const rangeTotal = daily.reduce((sum, item) => sum + item.count, 0);

  const aggregate = new Map<string, number>();
  dates.forEach((date) => {
    const day = endpointStats[date];
    if (!day) return;
    Object.entries(day).forEach(([name, count]) => {
      aggregate.set(name, (aggregate.get(name) || 0) + count);
    });
  });

  const endpointTotal = Array.from(aggregate.values()).reduce((sum, count) => sum + count, 0);
  const today = dateKey();
  const endpoints: AnalyticsEndpoint[] = Array.from(aggregate.entries())
    .map(([name, count]) => ({
      name,
      count,
      today: endpointStats[today]?.[name] || 0,
      share: endpointTotal > 0 ? count / endpointTotal : 0,
    }))
    .sort((a, b) => b.count - a.count);

  pruneRecentHits(now - QPS_WINDOW_MS);
  const lastMinute = recentHits.length - recentStart;

  return {
    days: safeDays,
    generatedAt: new Date().toISOString(),
    total: totalCount,
    today: dailyStats[today] || 0,
    rangeTotal,
    lastMinute,
    qps: lastMinute / (QPS_WINDOW_MS / 1000),
    uptimeSeconds: Math.floor(process.uptime()),
    daily,
    endpoints,
  };
};
