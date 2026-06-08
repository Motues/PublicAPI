import type { Context, Next } from 'hono';
import storage from 'node-persist';
import { logger } from '../logger.js';

// 初始化存储
await storage.init({
  dir: './data/stats', // 数据保存目录
  forgiveParseErrors: true,
});

// 内内存聚合，避免竞态条件和频繁磁盘写入
let totalCount = await storage.getItem('totalCount') || 0;
const dailyStats: Record<string, number> = await storage.getItem('dailyStats') || {};

// 定期刷新到磁盘（每 5 秒）
const flushInterval = setInterval(async () => {
  try {
    await Promise.all([
      storage.setItem('totalCount', totalCount),
      storage.setItem('dailyStats', dailyStats)
    ]);
  } catch (e) {
    logger.error('Failed to flush stats to disk:', e, 'Counter');
  }
}, 5000);

// 在程序退出前强制保存
async function gracefulShutdown() {
  logger.info('Flushing stats before shutdown...', 'Counter');
  clearInterval(flushInterval);
  try {
    await Promise.all([
      storage.setItem('totalCount', totalCount),
      storage.setItem('dailyStats', dailyStats)
    ]);
    logger.info('Stats saved successfully', 'Counter');
  } catch (e) {
    logger.error('Failed to save stats on shutdown:', e, 'Counter');
  }
  process.exit(0);
}

// 监听退出信号
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('beforeExit', gracefulShutdown);

export const counterMiddleware = async (c: Context, next: Next) => {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

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
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  return {
    total: totalCount,
    today: dailyStats[today] || 0
  };
};
