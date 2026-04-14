import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

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
        console.log(`[Doc Preloader] Loaded: ${folder}`);
      }
    }
  } catch (err) {
    console.error('[Doc Preloader] Error during preloading:', err);
  }
};

// 执行预加载
await preloadDocs();

// --- 路由处理函数 ---
export const docPage = async (c) => {
  const subPath = c.req.param('path') // 获取匹配路径
  const htmlContent = docCache.get(subPath);

  // 匹配失败返回错误页面
  if (!htmlContent) {
    return c.html(`
      <div style="text-align:center; margin-top:100px; font-family:monospace;">
        <h1 style="color:#d73a49">404 - DOCUMENT NOT FOUND</h1>
        <p>找不到名为 <code>${subPath}</code> 的文档内容。</p>
        <a href="/">返回首页</a>
      </div>
    `, 404);
  }

  // 返回页面
  return c.html(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subPath.toUpperCase()} - Documentation</title>
      <style>
        :root { --border-color: #333; --accent-color: #d73a49; --code-bg: #f6f8fa; }
        body { 
          max-width: 780px; margin: 0 auto; padding: 40px 20px; 
          font-family: -apple-system, "SFMono-Regular", Consolas, sans-serif; 
          line-height: 1.6; color: #24292e;
        }
        .doc-container { border: 1px solid var(--border-color); padding: 30px; position: relative; }
        .doc-header { position: absolute; top: -12px; left: 20px; background: white; padding: 0 10px; font-size: 14px; font-weight: bold; }
        h1, h2, h3 { border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
        pre { background: var(--code-bg); padding: 16px; border: 1px solid #e1e4e8; overflow-x: auto; margin: 1em 0; }
        pre code { background: transparent !important; padding: 0 !important; border-radius: 0;color: inherit; }
        code { background: rgba(27,31,35,0.05); padding: 0.2em 0.4em; border-radius: 3px; }
        pre::-webkit-scrollbar { height: 6px; width: 6px; }
        pre::-webkit-scrollbar-track { background: var(--code-bg); }
        pre::-webkit-scrollbar-thumb {background-color: #ddd; border-radius: 10px; }
        pre::-webkit-scrollbar-thumb:hover { background-color: #bbb;}
        blockquote { border-left: 4px solid var(--accent-color); padding-left: 16px; color: #6a737d; margin: 0; }
        a { color: #0366d6; text-decoration: none; }
        .back-link { margin-bottom: 20px; display: block; font-size: 14px; color: #666; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <a href="/" class="back-link">← 返回系统终端</a>
      <div class="doc-container">
        <div class="doc-header">[DOCUMENTATION] /docs/${subPath}</div>
        <article class="markdown-body">
          ${htmlContent}
        </article>
      </div>
    </body>
    </html>
  `);
};