import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  ConfigValidationError,
  loadEmojiData,
  loadMetingSettings,
  loadServices,
  loadSiteConfig,
  saveEmojiData,
  saveMetingSettings,
  saveServices,
  saveSiteConfig,
} from '../../utils/dataLoader.js';
import {
  canUseSetupPage,
  clearSessionCookie,
  createSessionToken,
  getLoginLockStatus,
  getPasswordSource,
  getSessionTtlMinutes,
  isAuthenticated,
  isPasswordFromEnv,
  recordLoginFailure,
  requireAdminAuth,
  requireSameOrigin,
  resetLoginFailures,
  rotateSessionSecret,
  saveAdminPassword,
  setSessionCookie,
  verifyAdminPassword,
} from '../../utils/adminAuth.js';
import { getStats } from '../../utils/middleware/counter.js';
import { clearResponseCache } from '../../utils/middleware/lruCache.js';
import { clearMusicInfoCache } from '../../controllers/musicController.js';
import { getSystemInfo } from '../../utils/systemInfo.js';
import { logger } from '../../utils/logger.js';

/**
 * 管理后台接口，挂载于 /admin/api
 *
 * 所有写操作都经过 requireSameOrigin（同源校验 + X-Admin-Request 请求头），
 * 除登录/初始化外的接口都需要有效会话。
 */
const adminApi = new Hono();

adminApi.use('*', requireSameOrigin);

// 管理接口一律不缓存
adminApi.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

/** 安全地读取 JSON 请求体 */
const readJsonBody = async (c: Context): Promise<Record<string, unknown>> => {
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // 空 body 或非法 JSON 均视为空对象，由具体字段校验给出提示
  }
  return {};
};

/** 统一的配置写入响应处理 */
const writeConfig = (c: Context, action: () => unknown) => {
  try {
    return c.json({ ok: true, data: action() });
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return c.json({ error: error.message }, 400);
    }

    logger.error('Failed to save config from admin panel:', error, 'Admin');
    return c.json({ error: '配置保存失败，请查看服务端日志' }, 500);
  }
};

const getPasswordLengthError = (password: string, field: string): string | null => {
  if (password.length < 8) {
    return `${field}长度至少 8 位`;
  }
  if (password.length > 128) {
    return `${field}长度不能超过 128 位`;
  }
  return null;
};

// ---------------------------------------------------------------------------
// 会话
// ---------------------------------------------------------------------------

/** 查询会话与初始化状态 */
adminApi.get('/session', (c) => {
  const passwordSource = getPasswordSource();
  const authenticated = isAuthenticated(c);

  return c.json({
    authenticated,
    passwordSource,
    passwordFromEnv: isPasswordFromEnv(),
    needsSetup: passwordSource === 'unset',
    canSetup: passwordSource === 'unset' ? canUseSetupPage(c) : false,
    sessionTtlMinutes: getSessionTtlMinutes(),
    lock: getLoginLockStatus(c),
  });
});

/** 首次初始化管理员密码（仅在完全未配置密码时可用） */
adminApi.post('/setup', async (c) => {
  if (getPasswordSource() !== 'unset') {
    return c.json({ error: '管理员密码已配置，无法重复初始化' }, 409);
  }

  if (!canUseSetupPage(c)) {
    return c.json({
      error: '出于安全考虑，初始化仅允许本机或内网访问。请在 .env / docker 环境变量中设置 ADMIN_PASSWORD 后重启服务。',
    }, 403);
  }

  const body = await readJsonBody(c);
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  const lengthError = getPasswordLengthError(password, '密码');
  if (lengthError) {
    return c.json({ error: lengthError }, 400);
  }
  if (password !== confirmPassword) {
    return c.json({ error: '两次输入的密码不一致' }, 400);
  }

  try {
    saveAdminPassword(password);
  } catch (error) {
    logger.error('Failed to persist admin password:', error, 'Admin');
    return c.json({ error: '密码保存失败，请查看服务端日志' }, 500);
  }

  const { token, expiresAt } = createSessionToken();
  setSessionCookie(c, token, expiresAt);
  logger.info('Admin password initialized via setup page', 'Admin');

  return c.json({ ok: true, authenticated: true, expiresAt });
});

/** 登录 */
adminApi.post('/login', async (c) => {
  const passwordSource = getPasswordSource();
  if (passwordSource === 'unset') {
    return c.json({
      error: '尚未配置管理员密码',
      needsSetup: true,
      canSetup: canUseSetupPage(c),
    }, 409);
  }

  const lock = getLoginLockStatus(c);
  if (lock.locked) {
    c.header('Retry-After', String(lock.retryAfterSeconds));
    return c.json({
      error: `登录失败次数过多，请在 ${lock.retryAfterSeconds} 秒后重试`,
      retryAfter: lock.retryAfterSeconds,
    }, 429);
  }

  const body = await readJsonBody(c);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!verifyAdminPassword(password)) {
    const after = recordLoginFailure(c);
    logger.warn('Failed admin login attempt', 'Admin');
    return c.json({
      error: after.locked ? '登录失败次数过多，账号已临时锁定' : '密码错误',
      remainingAttempts: after.remainingAttempts,
      locked: after.locked,
      retryAfter: after.retryAfterSeconds,
    }, after.locked ? 429 : 401);
  }

  resetLoginFailures(c);
  const { token, expiresAt } = createSessionToken();
  setSessionCookie(c, token, expiresAt);
  logger.info('Admin logged in', 'Admin');

  return c.json({ ok: true, authenticated: true, expiresAt });
});

/** 退出登录 */
adminApi.post('/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true, authenticated: false });
});

/** 修改密码（密码由环境变量控制时不可用） */
adminApi.post('/password', requireAdminAuth, async (c) => {
  if (isPasswordFromEnv()) {
    return c.json({
      error: '当前密码由环境变量控制，请在 ADMIN_PASSWORD / ADMIN_PASSWORD_HASH 中修改后重启服务',
    }, 400);
  }

  const body = await readJsonBody(c);
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  if (!verifyAdminPassword(currentPassword)) {
    return c.json({ error: '当前密码不正确' }, 400);
  }

  const lengthError = getPasswordLengthError(newPassword, '新密码');
  if (lengthError) {
    return c.json({ error: lengthError }, 400);
  }
  if (newPassword !== confirmPassword) {
    return c.json({ error: '两次输入的新密码不一致' }, 400);
  }
  if (verifyAdminPassword(newPassword)) {
    return c.json({ error: '新密码不能与当前密码相同' }, 400);
  }

  try {
    saveAdminPassword(newPassword);
    rotateSessionSecret();
  } catch (error) {
    logger.error('Failed to update admin password:', error, 'Admin');
    return c.json({ error: '密码保存失败，请查看服务端日志' }, 500);
  }

  const { token, expiresAt } = createSessionToken();
  setSessionCookie(c, token, expiresAt);

  return c.json({ ok: true, expiresAt });
});

// ---------------------------------------------------------------------------
// 配置读写
// ---------------------------------------------------------------------------

/** 读取全部可管理配置 */
adminApi.get('/config', requireAdminAuth, (c) => {
  return c.json({
    site: loadSiteConfig(),
    services: loadServices(),
    meting: loadMetingSettings(),
    emoji: loadEmojiData(),
  });
});

/** 保存站点配置（含表情接口对外地址，改动后清理表情接口缓存） */
adminApi.put('/config/site', requireAdminAuth, async (c) => {
  const body = await readJsonBody(c);
  return writeConfig(c, () => {
    const saved = saveSiteConfig({
      siteName: body.siteName,
      description: body.description,
      footer: body.footer,
      emojiBaseUrl: body.emojiBaseUrl,
    });

    // 表情接口对外地址决定返回的图片绝对地址，变更后需要让已缓存的响应失效
    if (body.emojiBaseUrl !== undefined) {
      const clearedResponses = clearResponseCache();
      logger.info(`Emoji base URL updated, cleared ${clearedResponses} responses`, 'Admin');
    }

    return saved;
  });
});

/** 保存服务目录 */
adminApi.put('/config/services', requireAdminAuth, async (c) => {
  const body = await readJsonBody(c);
  return writeConfig(c, () => saveServices(body.services));
});

/** 保存音乐接口设置（保存后清理音乐相关缓存） */
adminApi.put('/config/meting', requireAdminAuth, async (c) => {
  const body = await readJsonBody(c);
  return writeConfig(c, () => {
    const saved = saveMetingSettings({ cookie: body.cookie });
    const clearedResponses = clearResponseCache();
    const clearedSongs = clearMusicInfoCache();
    logger.info(`Meting config updated, cleared ${clearedResponses} responses / ${clearedSongs} song details`, 'Admin');
    return saved;
  });
});

/** 保存表情数据（OwO 格式，保存后清理表情接口缓存） */
adminApi.put('/config/emoji', requireAdminAuth, async (c) => {
  const body = await readJsonBody(c);
  return writeConfig(c, () => {
    const saved = saveEmojiData(body.emoji);
    const clearedResponses = clearResponseCache();
    logger.info(`Emoji config updated, cleared ${clearedResponses} responses`, 'Admin');
    return saved;
  });
});

// ---------------------------------------------------------------------------
// 运行状态
// ---------------------------------------------------------------------------

/** 运行状态与请求统计 */
adminApi.get('/status', requireAdminAuth, async (c) => {
  const stats = await getStats();
  const system = getSystemInfo();

  return c.json({
    stats,
    passwordSource: getPasswordSource(),
    site: loadSiteConfig().siteName,
    system: {
      osName: system.osName,
      platform: system.platform,
      arch: system.arch,
      hostname: system.hostname,
      nodeVersion: system.nodeVersion,
      cpus: system.cpus,
      totalMemory: system.totalMemory,
      freeMemory: system.freeMemory,
      isDocker: system.isDocker,
    },
    processUptimeSeconds: Math.floor(process.uptime()),
  });
});

/** 手动清理接口缓存 */
adminApi.post('/cache/clear', requireAdminAuth, (c) => {
  const clearedResponses = clearResponseCache();
  const clearedSongs = clearMusicInfoCache();

  return c.json({ ok: true, clearedResponses, clearedSongs });
});

export default adminApi;
