import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Avatar from 'boring-avatars'
import type { Context } from 'hono';
import { logger } from '../utils/logger.js';

type Variant = "pixel" | "bauhaus" | "ring" | "sunset" | "beam" | "marble"

const VARIANTS: ReadonlySet<string> = new Set(['pixel', 'bauhaus', 'ring', 'sunset', 'beam', 'marble']);
const MODES: ReadonlySet<string> = new Set(['generate', 'gravatar', 'weavatar', 'cravatar']);
const DEFAULT_COLORS = ["#FFADAD", "#FFD6A5", "#FDFFB6", "#FF9900", "#AABBCC"];
const MAX_NAME_LENGTH = 256;
const MAX_COLORS = 10;
/** 同时进行的外部头像探测数量上限；超过时直接回退本地生成，避免拖垮事件循环 */
const MAX_UPSTREAM_PROBES = 8;

let upstreamProbes = 0;

const parseSize = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return 200;
  }
  return Math.min(Math.max(parsed, 16), 1024);
};

const parseColors = (value: string | undefined): string[] => {
  if (!value) {
    return DEFAULT_COLORS;
  }

  const colors = value
    .split(',')
    .map((color) => color.trim())
    .filter((color) => color !== '')
    .slice(0, MAX_COLORS)
    .map((color) => (color.startsWith('#') ? color : `#${color}`))
    .filter((color) => /^#[0-9a-f]{3,8}$/i.test(color));

  return colors.length > 0 ? colors : DEFAULT_COLORS;
};

const sanitizeForLog = (value: string): string =>
  value.replace(/[\r\n\t]/g, ' ').slice(0, MAX_NAME_LENGTH);

const probeUpstream = async (url: string): Promise<Response> => {
  upstreamProbes += 1;
  try {
    return await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
  } finally {
    upstreamProbes -= 1;
  }
};

export const getAvatarData = async (c: Context) => {
  const rawName = c.req.query('name');
  const name = (rawName ?? '').trim() || 'Maria Mitchell';
  const variantParam = (c.req.query('variant') ?? 'marble').trim().toLowerCase();
  const size = parseSize(c.req.query('size'));
  const square = c.req.query('square') === 'true';
  const modeParam = (c.req.query('mode') ?? 'generate').trim().toLowerCase();
  const colors = parseColors(c.req.query('colors'));

  if (name.length > MAX_NAME_LENGTH) {
    return c.json({ error: `name 长度不能超过 ${MAX_NAME_LENGTH} 个字符` }, 400);
  }
  if (!VARIANTS.has(variantParam)) {
    return c.json({ error: 'Invalid variant parameter' }, 400);
  }
  if (!MODES.has(modeParam)) {
    return c.json({ error: 'Invalid mode parameter' }, 400);
  }

  const variant = variantParam as Variant;
  const mode = modeParam;

  logger.info(`Name: ${sanitizeForLog(name)}, Mode: ${mode}`, 'Avatar');

  // 混合模式：先探测 Weavatar，再探测 Cravatar；失败/繁忙时回退本地生成
  if (mode !== 'generate' && upstreamProbes < MAX_UPSTREAM_PROBES) {
    try {
      const emailHash = encodeURIComponent(name.trim().toLowerCase());
      const cravatarUrl = `https://cravatar.cn/avatar/${emailHash}?s=${size}&d=retro`;
      const weavatarUrl = `https://weavatar.com/avatar/${emailHash}?s=${size}&d=retro`;

      // 检查 weavatar 是否存在
      const weavatarResponse = await probeUpstream(weavatarUrl);
      if (weavatarResponse.ok && weavatarResponse.headers.get('x-avatar-from') !== 'weavatar') {
        return c.redirect(weavatarUrl);
      }

      // 检查 cravatar 是否存在
      const cravatarResponse = await probeUpstream(cravatarUrl);
      if (cravatarResponse.ok && cravatarResponse.headers.get('avatar-from') !== 'default') {
        return c.redirect(cravatarUrl);
      }
    } catch (err) {
      logger.error('Gravatar fetch error:', err, 'Avatar');
      logger.info('Falling back to generate mode.', 'Avatar');
      // 出错时回退到下面的生成模式
    }
  }

  // 生成 boring-avatar 的 SVG
  try {
    const svg = renderToStaticMarkup(
      React.createElement(Avatar, {
        size,
        name,
        variant,
        colors,
        square
      })
    );

    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    });
  } catch (err) {
    logger.error('Avatar generation error:', err, 'Avatar');
    return c.text('Internal Server Error', 500);
  }
}
