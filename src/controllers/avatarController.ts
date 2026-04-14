import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Avatar from 'boring-avatars'
import type { Context } from 'hono';

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

  // 1. 如果是 cravatar 模式，进行逻辑判断
  if (mode === 'cravatar') {
    try {
      const emailHash = name.trim().toLowerCase(); 
      const cravatarUrl = `https://cravatar.cn/avatar/${emailHash}?s=${size}&d=retro`;

      const response = await fetch(cravatarUrl, { method: 'HEAD' });
      
      if (response.ok && response.headers.get('avatar-from') !== 'default') {
        return c.redirect(cravatarUrl);
      }
    } catch (err) {
      // console.error('Cravatar fetch error:', err);
      // 出错时回退到下面的生成模式
    }
  }

  // 2. 生成模式 (或者是 Cravatar 判定为默认头像后的回退逻辑)
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
      'Cache-Control': 'public, max-age=31536000',
    });
  } catch (err) {
    return c.text('Internal Server Error', 500);
  }
}