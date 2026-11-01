import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { logger } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/html.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docCache = new Map<string, string>();

// --- 预加载逻辑 ---
const preloadDocs = async () => {
  const docsDir = path.join(__dirname, '../../../doc');

  try {
    if (!fs.existsSync(docsDir)) return;

    const folders = fs.readdirSync(docsDir);

    for (const folder of folders) {
      const readmePath = path.join(docsDir, folder, 'README.md');

      if (fs.existsSync(readmePath)) {
        const rawContent = fs.readFileSync(readmePath, 'utf-8');
        // 预先将 Markdown 转换为 HTML
        const html = await marked(rawContent);
        docCache.set(folder, html);
        logger.info(`Loaded: ${folder}`, 'Doc');
      }
    }
  } catch (err) {
    logger.error('Error during preloading:', err, 'Doc');
  }
};

// 首次访问 /docs 时再加载，避免阻塞服务启动；用 Promise 复用并发请求
let docsPromise: Promise<void> | null = null;
const ensureDocsLoaded = (): Promise<void> => {
  if (!docsPromise) {
    docsPromise = preloadDocs();
  }
  return docsPromise;
};

// --- 路由处理函数 ---
export const docPage = async (c) => {
  await ensureDocsLoaded();

  const subPath = c.req.param('path'); // 获取匹配路径
  const safePath = escapeHtml(subPath);
  const htmlContent = docCache.get(subPath);

  // 匹配失败返回错误页面
  if (!htmlContent) {
    return c.html(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light dark">
        <title>404 - Document Not Found</title>
        <style>
          :root { color-scheme: light dark; --bg-color: #ffffff; --text-color: #24292e; --danger-color: #d73a49; --link-color: #0366d6; }
          @media (prefers-color-scheme: dark) {
            :root { --bg-color: #0d1117; --text-color: #c9d1d9; --danger-color: #ff7b72; --link-color: #58a6ff; }
          }
          body { background: var(--bg-color); color: var(--text-color); }
          h1 { color: var(--danger-color); }
          a { color: var(--link-color); }
        </style>
      </head>
      <body>
        <div style="text-align:center; margin-top:100px; font-family:monospace;">
          <h1>404 - DOCUMENT NOT FOUND</h1>
          <p>找不到名为 <code>${safePath}</code> 的文档内容。</p>
          <a href="/">返回首页</a>
        </div>
      </body>
      </html>
    `, 404);
  }

  // 返回页面
  return c.html(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d1117">
      <title>${safePath.toUpperCase()} - Documentation</title>
      <style>
        :root {
          color-scheme: light dark;
          --bg-color: #ffffff;
          --text-color: #24292e;
          --muted-color: #6a737d;
          --subtle-color: #666666;
          --border-color: #333333;
          --line-color: #eeeeee;
          --accent-color: #d73a49;
          --link-color: #0366d6;
          --code-bg: #f6f8fa;
          --inline-code-bg: rgba(27,31,35,0.05);
          --scrollbar-thumb: #dddddd;
          --scrollbar-thumb-hover: #bbbbbb;
        }

        @media (prefers-color-scheme: dark) {
          :root {
            --bg-color: #0d1117;
            --text-color: #c9d1d9;
            --muted-color: #8b949e;
            --subtle-color: #8b949e;
            --border-color: #30363d;
            --line-color: #30363d;
            --accent-color: #ff7b72;
            --link-color: #58a6ff;
            --code-bg: #161b22;
            --inline-code-bg: rgba(110,118,129,0.4);
            --scrollbar-thumb: #30363d;
            --scrollbar-thumb-hover: #3f4650;
          }
        }

        body { max-width: 780px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, "SFMono-Regular", Consolas, sans-serif; line-height: 1.6; color: var(--text-color); background: var(--bg-color); }
        .doc-container { border: 1px solid var(--border-color); padding: 30px; position: relative; }
        .doc-header { position: absolute; top: -12px; left: 20px; background: var(--bg-color); padding: 0 10px; font-size: 14px; font-weight: bold; }
        h1, h2, h3 { border-bottom: 1px solid var(--line-color); padding-bottom: 0.3em; }
        pre { background: var(--code-bg); padding: 16px; border: 1px solid var(--line-color); overflow-x: auto; margin: 1em 0; }
        pre code { background: transparent !important; padding: 0 !important; border-radius: 0;color: inherit; }
        code { background: var(--inline-code-bg); padding: 0.2em 0.4em; border-radius: 3px; }
        pre::-webkit-scrollbar { height: 6px; width: 6px; }
        pre::-webkit-scrollbar-track { background: var(--code-bg); }
        pre::-webkit-scrollbar-thumb {background-color: var(--scrollbar-thumb); border-radius: 10px; }
        pre::-webkit-scrollbar-thumb:hover { background-color: var(--scrollbar-thumb-hover);}
        blockquote { border-left: 4px solid var(--accent-color); padding-left: 16px; color: var(--muted-color); margin: 0; }
        a { color: var(--link-color); text-decoration: none; word-break: break-all; overflow-wrap: break-word; }
        .back-link { margin-bottom: 20px; display: block; font-size: 14px; color: var(--subtle-color); text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <a href="/" class="back-link">← 返回系统终端</a>
      <div class="doc-container">
        <div class="doc-header">[DOCUMENTATION] /docs/${safePath}</div>
        <article class="markdown-body">
          ${htmlContent}
        </article>
      </div>
    </body>
    </html>
  `);
};
