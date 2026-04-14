import storage from 'node-persist';

// 初始化存储
await storage.init({
  dir: './data/stats', // 数据保存目录
});

export const incrementCounter = async () => {
  const today = new Date().toISOString().split('T')[0]; // 获取格式如 2024-05-20 的日期

  // 获取现有数据
  let totalCount = await storage.getItem('totalCount') || 0;
  let dailyStats = await storage.getItem('dailyStats') || {};

  // 更新总数
  totalCount++;
  
  // 更新当日数
  if (!dailyStats[today]) {
    dailyStats[today] = 0;
  }
  dailyStats[today]++;

  // 持久化保存
  await storage.setItem('totalCount', totalCount);
  await storage.setItem('dailyStats', dailyStats);

  return {
    total: totalCount,
    today: dailyStats[today]
  };
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