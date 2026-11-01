import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { shutdownStats } from './utils/middleware/counter.js';

const app = createApp();

const server: ServerType = serve({
  fetch: app.fetch,
  port: config.port,
});

let shuttingDown = false;

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`, 'Server');

  // 兜底：10 秒内没退出就强制结束，避免容器 stop 卡住
  const forceExit = setTimeout(() => {
    logger.error('Forced shutdown after timeout', 'Server');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await shutdownStats();
  } catch (error) {
    logger.error('Failed to shut down cleanly:', error, 'Server');
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

logger.info(`Open Service: ${config.musicOpen ? 'Music ' : ''}${config.avatarOpen ? 'Avatar ' : ''}${config.emojiOpen ? 'Emoji' : ''}`.trim());
logger.info(`Server is running on http://localhost:${config.port}`);
logger.info('Health check: /healthz', 'Server');

export default app;
