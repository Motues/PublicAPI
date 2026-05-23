import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Avatar from 'boring-avatars'
import type { Context } from 'hono';
import { logger } from '../utils/logger.js';

type Variant = "pixel" | "bauhaus" | "ring" | "sunset" | "beam" | "marble"

export const getAvatarData = async (c: Context) => {
  const name = c.req.query('name') || 'Maria Mitchell';
  const variant = (c.req.query('variant') || 'marble') as Variant;
  const size = Number(c.req.query('size')) || 200;
  const square = c.req.query('square') === 'true';
  const colorsParam = c.req.query('colors');

  // 新增参数：mode (默认 'beam' 或 'generate'，'cravatar' 为混合模式)
  const mode = c.req.query('mode') || 'generate';

  const colors = colorsParam
    ? colorsParam.split(',').map(color => color.startsWith('#') ? color : `#${color}`)
    : ["#FFADAD", "#FFD6A5", "#FDFFB6", "#FF9900", "#AABBCC"];

  logger.info(`Name: ${name}, Mode: ${mode}`, 'Avatar');

  // cravatar 模式
  if (mode === 'cravatar') {
    try {
      const emailHash = name.trim().toLowerCase();
      const cravatarUrl = `https://cravatar.cn/avatar/${emailHash}?s=${size}&d=retro`;

      const response = await fetch(cravatarUrl, { method: 'HEAD' });

      if (response.ok && response.headers.get('avatar-from') !== 'default') {
        return c.redirect(cravatarUrl);
      }
    } catch (err) {
      logger.error('Cravatar fetch error:', err, 'Avatar');
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
