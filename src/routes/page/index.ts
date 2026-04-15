import { getStats } from '../../utils/counter.js';
import { config } from '../../utils/config.js';
import { loadServices } from '../../utils/serviceLoader.js';

export const indexPage = async (c) => {
  const stats = await getStats();
  const currentTime = new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
  const currentYear = new Date().getFullYear();
  const services = loadServices();

  const serviceCards = services.map(service => {
    const isOnline = service.status === 'open';
    return `
      <a class="api-item" href="${service.url}" target="_blank">
        <span>${service.name}</span>
        <span class="status-dot ${isOnline ? 'on' : 'off'}"></span>
      </a>`;
  }).join('\n');

  return c.html(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Public API - System Terminal</title>
      <style>
        :root { --border-color: #333; --bg-color: #ffffff; --text-color: #24292e; --accent-color: #067ece; }
        body { max-width: 600px; margin: 40px auto; padding: 20px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; background-color: var(--bg-color);color: var(--text-color);line-height: 1.5; }
        .box { border: 1px solid var(--border-color); padding: 20px; margin-bottom: 25px; position: relative; }
        .box-title { position: absolute; top: -12px; left: 20px; background: white; padding: 0 10px; font-size: 14px; font-weight: bold; }
        .sys-header { text-align: center; margin-bottom: 20px; }
        .sys-title { font-size: 24px; margin: 10px 0; border-bottom: 2px solid var(--accent-color); display: inline-block; }
        .api-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px; }
        .api-item { border: 1px solid #ddd; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: inherit; transition: all 0.2s ease; cursor: pointer; }
        .api-item:hover { border-color: var(--border-color); background: #fafafa; }
        .status-dot { height: 8px; width: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; }
        .on { background-color: #28a745; }
        .off { background-color: #ccc; }
        .stats-info { margin-top: 15px; padding-top: 15px; border-top: 1px dashed #ddd; }
        .stats-info .stats-row {display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 14px; }
        .stats-label::before { content: "> "; color: var(--accent-color); font-weight: bold; }
        .stats-value b { color: #000; background: #f0f0f0; padding: 0 6px; border-radius: 2px; }
        .footer { margin-top: 50px; padding: 15px; border: 1px solid var(--border-color); text-align: center; font-size: 12px; color: #666; }
        .footer a { color: var(--text-color); text-decoration: none; font-weight: bold; border-bottom: 1px solid #ccc; padding: 0 2px; transition: 0.2s; }
        .footer a:hover { color: #fff; background-color: var(--border-color); border-bottom-color: var(--border-color); }
        hr { border: 0; border-top: 1px dashed #ccc; margin: 20px 0; }
        .cmd { color: var(--accent-color); }
      </style>
    </head>
    <body>

      <div class="box">
        <div class="box-title">[OS] 系统信息</div>
        <div class="sys-header">
            <div class="sys-title">PUBLIC API SERVER</div>
        </div>
        <div>操作系统: <span style="float:right">Ubuntu 24.04</span></div>
        <div>内核版本: <span style="float:right">Node.js / Hono</span></div>
        <div>系统时间: <span style="float:right">${currentTime}</span></div>
        <div>在线状态: <span style="float:right; color: #28a745;">正常运行中</span></div>
        <div class="stats-info">
          <div class="stats-row">
            <span class="stats-label">总请求数</span>
            <span class="stats-value"><b>${stats.total}</b> 次</span>
          </div>
          <div class="stats-row">
            <span class="stats-label">今日请求数</span>
            <span class="stats-value"><b>${stats.today}</b> 次</span>
          </div>
        </div>
      </div>

      <div class="box">
        <div class="box-title">[List] 服务目录</div>
        <div class="api-grid">
          <a class="api-item" href="/docs/meting">
            <span>[/music] Music API</span>
            <span class="status-dot ${config.musicOpen ? 'on' : 'off'}"></span>
          </a>
          <a class="api-item" href="/docs/boring-avatar">
            <span>[/avatar] Avatar API</span>
            <span class="status-dot ${config.avatarOpen ? 'on' : 'off'}"></span>
          </a>
          ${serviceCards}
        </div>
        <div style="margin-top: 15px; font-size: 13px; color: #888;">
            * 点击上方卡片进入对应服务页面
        </div>
      </div>

      <div class="footer">
        © ${currentYear} <a href="https://github.com/Motues/PublicAPI" target="_blank">Public API</a>
        <br>
        <span style="opacity: 0.8; margin-top: 8px; display: inline-block;">
          <span style="color: #28a745;">[STATUS OK]</span> 系统运行良好，欢迎使用
        </span>
      </div>

    </body>
    </html>
  `);
}