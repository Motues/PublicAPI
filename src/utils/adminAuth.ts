import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import type { Context, Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getClientIP } from './ip.js';
import { logger } from './logger.js';

/**
 * 管理后台认证与安全工具
 *
 * 密码来源优先级：
 *   1. 环境变量 ADMIN_PASSWORD（明文，兼容 docker / .env）
 *   2. 环境变量 ADMIN_PASSWORD_HASH（scrypt 哈希）
 *   3. data/config/admin.json 中的 passwordHash / password
 *   4. 均未配置时，允许本机/内网访问 /admin 完成初始化
 *
 * 登录成功后签发 HttpOnly + SameSite=Strict 的签名 Cookie 会话。
 */

/** 会话 Cookie 名称 */
export const ADMIN_SESSION_COOKIE = 'public_api_admin_session';

/** 会话默认有效期（分钟） */
const DEFAULT_SESSION_TTL_MINUTES = 120;

/** 连续登录失败次数上限与锁定时长 */
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;

/** scrypt 派生密钥长度 */
const SCRYPT_KEYLENGTH = 64;

/** admin.json 文件结构 */
interface AdminFileConfig {
  passwordHash?: string;
  password?: string;
  sessionSecret?: string;
}

export type PasswordSource = 'env-password' | 'env-hash' | 'file' | 'unset';

// ---------------------------------------------------------------------------
// admin.json 读写
// ---------------------------------------------------------------------------

const ADMIN_FILE_CACHE_MS = 5000;

let adminFileCache: AdminFileConfig | null = null;
let adminFileCacheTime = 0;

/** 写入失败时使用的进程内会话密钥，保证同一进程内会话稳定 */
let ephemeralSecret: string | null = null;

const getAdminConfigPath = (): string => join(process.cwd(), 'data', 'config', 'admin.json');

const readAdminFile = (): AdminFileConfig => {
  const now = Date.now();
  if (adminFileCache && now - adminFileCacheTime < ADMIN_FILE_CACHE_MS) {
    return adminFileCache;
  }

  const configPath = getAdminConfigPath();
  try {
    if (!existsSync(configPath)) {
      adminFileCache = {};
    } else {
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as AdminFileConfig;
      adminFileCache = parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch (error) {
    logger.error('Failed to read admin config:', error, 'Admin');
    adminFileCache = {};
  }

  adminFileCacheTime = now;
  return adminFileCache;
};

const writeAdminFile = (data: AdminFileConfig): void => {
  const configDir = join(process.cwd(), 'data', 'config');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const configPath = getAdminConfigPath();
  const tempPath = `${configPath}.tmp`;

  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  renameSync(tempPath, configPath);

  adminFileCache = data;
  adminFileCacheTime = Date.now();
};

// ---------------------------------------------------------------------------
// 密码哈希与校验
// ---------------------------------------------------------------------------

/** 生成 scrypt 密码哈希，格式：scrypt$<salt>$<hash> */
export const hashPassword = (password: string): string => {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
};

const verifyPasswordHash = (password: string, stored: string): boolean => {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const salt = Buffer.from(parts[1] ?? '', 'hex');
  const expected = Buffer.from(parts[2] ?? '', 'hex');
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  try {
    const actual = scryptSync(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

/** 定长比较，避免时序侧信道 */
const safeEqualString = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
};

/** 当前密码来源 */
export const getPasswordSource = (): PasswordSource => {
  if ((process.env.ADMIN_PASSWORD ?? '').trim() !== '') {
    return 'env-password';
  }
  if ((process.env.ADMIN_PASSWORD_HASH ?? '').trim() !== '') {
    return 'env-hash';
  }

  const file = readAdminFile();
  if (file.passwordHash || file.password) {
    return 'file';
  }

  return 'unset';
};

/** 密码是否由环境变量控制（此时无法在后台修改） */
export const isPasswordFromEnv = (): boolean => {
  const source = getPasswordSource();
  return source === 'env-password' || source === 'env-hash';
};

/** 校验管理员密码（明文比较时忽略首尾空白） */
export const verifyAdminPassword = (password: string): boolean => {
  if (typeof password !== 'string' || password.trim() === '') {
    return false;
  }

  const source = getPasswordSource();

  if (source === 'env-password') {
    return safeEqualString(password.trim(), (process.env.ADMIN_PASSWORD ?? '').trim());
  }

  if (source === 'env-hash') {
    return verifyPasswordHash(password, (process.env.ADMIN_PASSWORD_HASH ?? '').trim());
  }

  const file = readAdminFile();
  if (file.passwordHash) {
    return verifyPasswordHash(password, file.passwordHash);
  }
  if (file.password) {
    return safeEqualString(password.trim(), file.password.trim());
  }

  return false;
};

/**
 * 将新密码写入 data/config/admin.json（环境变量优先级更高，不受影响）
 */
export const saveAdminPassword = (password: string): void => {
  const file = readAdminFile();
  writeAdminFile({ sessionSecret: file.sessionSecret, passwordHash: hashPassword(password) });
  logger.info('Admin password updated', 'Admin');
};

// ---------------------------------------------------------------------------
// 会话密钥与签名会话
// ---------------------------------------------------------------------------

const getSessionSecret = (): string => {
  const fromEnv = (process.env.ADMIN_SESSION_SECRET ?? '').trim();
  if (fromEnv !== '') {
    return fromEnv;
  }

  const file = readAdminFile();
  if (file.sessionSecret) {
    return file.sessionSecret;
  }

  const secret = randomBytes(32).toString('hex');
  try {
    writeAdminFile({ ...file, sessionSecret: secret });
    logger.info('Generated and persisted a new admin session secret', 'Admin');
  } catch (error) {
    ephemeralSecret = secret;
    logger.error('Failed to persist admin session secret, sessions will reset after restart:', error, 'Admin');
  }

  return secret;
};

/** 轮换会话密钥，使已签发的会话立即失效（环境变量固定密钥时无法轮换） */
export const rotateSessionSecret = (): boolean => {
  if ((process.env.ADMIN_SESSION_SECRET ?? '').trim() !== '') {
    return false;
  }

  const file = readAdminFile();
  const secret = randomBytes(32).toString('hex');
  writeAdminFile({ ...file, sessionSecret: secret });
  ephemeralSecret = null;
  logger.info('Rotated admin session secret', 'Admin');
  return true;
};

/** 会话有效期（分钟），可通过 ADMIN_SESSION_TTL 调整 */
export const getSessionTtlMinutes = (): number => {
  const raw = Number(process.env.ADMIN_SESSION_TTL);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.floor(raw), 60 * 24 * 30);
  }
  return DEFAULT_SESSION_TTL_MINUTES;
};

interface SessionPayload {
  iat: number;
  exp: number;
  nonce: string;
}

const signPayload = (data: string): string =>
  createHmac('sha256', ephemeralSecret ?? getSessionSecret()).update(data).digest('hex');

/** 签发会话令牌 */
export const createSessionToken = (
  ttlMinutes: number = getSessionTtlMinutes()
): { token: string; expiresAt: number } => {
  const now = Date.now();
  const expiresAt = now + ttlMinutes * 60 * 1000;
  const payload: SessionPayload = { iat: now, exp: expiresAt, nonce: randomBytes(8).toString('hex') };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');

  return { token: `${encoded}.${signPayload(encoded)}`, expiresAt };
};

/** 校验会话令牌签名与有效期 */
export const verifySessionToken = (token: string | undefined): boolean => {
  if (!token) {
    return false;
  }

  const index = token.lastIndexOf('.');
  if (index <= 0) {
    return false;
  }

  const encoded = token.slice(0, index);
  const signature = token.slice(index + 1);

  if (!safeEqualString(signature, signPayload(encoded))) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as SessionPayload;
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
};

const isSecureRequest = (c: Context): boolean => {
  const forwardedProto = c.req.header('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim().toLowerCase() === 'https';
  }

  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
};

/** 写入会话 Cookie */
export const setSessionCookie = (c: Context, token: string, expiresAt: number): void => {
  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
    secure: isSecureRequest(c),
    expires: new Date(expiresAt),
  });
};

/** 清除会话 Cookie */
export const clearSessionCookie = (c: Context): void => {
  deleteCookie(c, ADMIN_SESSION_COOKIE, {
    path: '/',
    sameSite: 'Strict',
    secure: isSecureRequest(c),
  });
};

/** 当前请求是否已登录 */
export const isAuthenticated = (c: Context): boolean =>
  verifySessionToken(getCookie(c, ADMIN_SESSION_COOKIE));

// ---------------------------------------------------------------------------
// 登录失败锁定
// ---------------------------------------------------------------------------

interface LoginAttempt {
  failures: number;
  lastFailure: number;
  lockedUntil: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

export interface LoginLockStatus {
  locked: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
}

/** 查询当前 IP 的登录锁定状态 */
export const getLoginLockStatus = (c: Context): LoginLockStatus => {
  const entry = loginAttempts.get(getClientIP(c));
  const now = Date.now();

  if (!entry) {
    return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_LOGIN_FAILURES };
  }

  if (entry.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
      remainingAttempts: 0,
    };
  }

  if (now - entry.lastFailure > LOGIN_LOCK_MS) {
    return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_LOGIN_FAILURES };
  }

  return {
    locked: false,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, MAX_LOGIN_FAILURES - entry.failures),
  };
};

/** 记录一次登录失败 */
export const recordLoginFailure = (c: Context): LoginLockStatus => {
  const ip = getClientIP(c);
  const now = Date.now();
  const entry = loginAttempts.get(ip) ?? { failures: 0, lastFailure: now, lockedUntil: 0 };

  if (now - entry.lastFailure > LOGIN_LOCK_MS) {
    entry.failures = 0;
    entry.lockedUntil = 0;
  }

  entry.failures += 1;
  entry.lastFailure = now;

  if (entry.failures >= MAX_LOGIN_FAILURES) {
    entry.lockedUntil = now + LOGIN_LOCK_MS;
    logger.warn(`Admin login locked for ${ip} after ${entry.failures} failed attempts`, 'Admin');
  }

  loginAttempts.set(ip, entry);
  return getLoginLockStatus(c);
};

/** 登录成功后清除失败计数 */
export const resetLoginFailures = (c: Context): void => {
  loginAttempts.delete(getClientIP(c));
};

// ---------------------------------------------------------------------------
// 请求来源校验
// ---------------------------------------------------------------------------

const getSocketAddress = (c: Context): string => {
  try {
    return getConnInfo(c).remote.address ?? '';
  } catch {
    return '';
  }
};

/** 判断地址是否属于本机或内网 */
const isPrivateAddress = (address: string): boolean => {
  const ip = address.trim().toLowerCase();
  if (ip === '') {
    return false;
  }

  if (ip === 'localhost' || ip === '::1' || ip === '127.0.0.1') {
    return true;
  }
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) {
    return true;
  }
  if (ip.startsWith('::ffff:')) {
    return isPrivateAddress(ip.slice(7));
  }
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) {
    return true;
  }

  const match = /^172\.(\d{1,3})\./.exec(ip);
  if (match) {
    const second = Number(match[1]);
    return second >= 16 && second <= 31;
  }

  return false;
};

/**
 * 是否允许打开首次密码初始化页面
 * 默认仅本机 / 内网可初始化；可用 ADMIN_SETUP_REMOTE=true 放开
 */
export const canUseSetupPage = (c: Context): boolean => {
  if ((process.env.ADMIN_SETUP_REMOTE ?? '').trim().toLowerCase() === 'true') {
    return true;
  }

  // 直连来源必须是内网，防止伪造转发头绕过
  if (!isPrivateAddress(getSocketAddress(c))) {
    return false;
  }

  const forwarded: string[] = [];
  const cfConnectingIP = c.req.header('cf-connecting-ip');
  if (cfConnectingIP) {
    forwarded.push(cfConnectingIP);
  }
  const xRealIP = c.req.header('x-real-ip');
  if (xRealIP) {
    forwarded.push(xRealIP);
  }
  const xForwardedFor = c.req.header('x-forwarded-for');
  if (xForwardedFor) {
    forwarded.push(...xForwardedFor.split(','));
  }

  return forwarded
    .map((value) => value.trim())
    .filter((value) => value !== '')
    .every(isPrivateAddress);
};

/**
 * 管理接口来源校验中间件：拒绝跨站写操作，并要求自定义请求头
 */
export const requireSameOrigin = async (c: Context, next: Next) => {
  const method = c.req.method.toUpperCase();

  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    const origin = c.req.header('origin');

    if (origin && origin !== 'null') {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = '';
      }

      if (originHost === '' || originHost !== c.req.header('host')) {
        logger.warn(`Rejected admin request from cross origin: ${origin}`, 'Admin');
        return c.json({ error: '跨站请求已被拒绝' }, 403);
      }
    }

    if (c.req.header('x-admin-request') !== '1') {
      return c.json({ error: '缺少 X-Admin-Request 请求头' }, 403);
    }
  }

  await next();
};

/**
 * 登录校验中间件
 */
export const requireAdminAuth = async (c: Context, next: Next) => {
  if (!isAuthenticated(c)) {
    return c.json({ error: '未登录或会话已过期', authenticated: false }, 401);
  }

  await next();
};
