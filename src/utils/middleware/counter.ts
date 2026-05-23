import type { Context, Next } from 'hono';
import storage from 'node-persist';
import { logger } from '../logger.js';

// 初始化存储
await storage.init({
  dir: './data/stats', // 数据保存目录
});

// 内内存聚合，避免竞态条件和频繁磁盘写入
let totalCount = await storage.getItem('totalCount') || 0;
const dailyStats: Record<string, number> = await storage.getItem('dailyStats') || {};

// 定期刷新到磁盘（每 5 秒）
setInterval(async () => {
  try {
    await storage.setItem('totalCount', totalCount);
    await storage.setItem('dailyStats', dailyStats);
  } catch (e) {
    logger.error('Failed to flush stats to disk:', e, 'Counter');
  }
}, 5000);

export const counterMiddleware = async (c: Context, next: Next) => {
  const today = new Date().toISOString().split('T')[0];

  totalCount++;
  if (!dailyStats[today]) {
    dailyStats[today] = 0;
  }
  dailyStats[today]++;

  c.set('stats', {
    total: totalCount,
    today: dailyStats[today]
  });

  await next();
};

export const getStats = async () => {
  const today = new Date().toISOString().split('T')[0];
  return {
    total: totalCount,
    today: dailyStats[today] || 0
  };
};
