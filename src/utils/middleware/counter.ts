import type { Context, Next } from 'hono';
import storage from 'node-persist';

// 初始化存储
await storage.init({
  dir: './data/stats', // 数据保存目录
});

export const counterMiddleware = async (c: Context, next: Next) => {
  const today = new Date().toISOString().split('T')[0];

  let totalCount = await storage.getItem('totalCount') || 0;
  let dailyStats = await storage.getItem('dailyStats') || {};

  totalCount++;
  
  if (!dailyStats[today]) {
    dailyStats[today] = 0;
  }
  dailyStats[today]++;

  await storage.setItem('totalCount', totalCount);
  await storage.setItem('dailyStats', dailyStats);

  c.set('stats', {
    total: totalCount,
    today: dailyStats[today]
  });

  await next();
};

export const getStats = async () => {
  const today = new Date().toISOString().split('T')[0];
  const total = await storage.getItem('totalCount') || 0;
  const dailyStats = await storage.getItem('dailyStats') || {};
  return {
    total,
    today: dailyStats[today] || 0
  };
};