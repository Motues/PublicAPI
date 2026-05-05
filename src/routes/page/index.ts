import { getStats } from '../../utils/middleware/counter.js';
import { config } from '../../utils/config.js';
import { loadServices, loadSiteConfig } from '../../utils/dataLoader.js';
import { getSystemInfo } from '../../utils/systemInfo.js';

const osName = getSystemInfo().osName || 'Unknown OS';
export const indexPage = async (c) => {
  const stats = await getStats();
  const currentTime = new Date().toLocaleString('zh-CN', { hour12: false /*, timeZone: 'Asia/Shanghai' */ });
  const currentYear = new Date().getFullYear();
  const services = loadServices(), siteConfig = loadSiteConfig();

  const siteName = siteConfig.siteName || 'Public API Server';
  const siteDescriptions = siteConfig.description.length > 0 ? siteConfig.description : ['Welcome to Public API Server'];
  const siteFooter = siteConfig.footer || 'Status: Online';

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
      <title>${siteName}</title>
      <link rel="stylesheet" href="https://fonts.font.im/css2?family=Noto+Serif+SC:wght@400;700&display=swap">
      <style>
        :root { --border-color: #333; --bg-color: #ffffff; --text-color: #24292e; --accent-color: #067ece; }
        body { max-width: 600px; margin: 40px auto; padding: 20px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace, 'Noto Serif SC', -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif; background-color: var(--bg-color);color: var(--text-color);line-height: 1.5; }
        .box { border: 1px solid var(--border-color); padding: 20px; margin-bottom: 25px; position: relative; }
        .box-title { position: absolute; top: -12px; left: 20px; background: white; padding: 0 10px; font-size: 14px; font-weight: bold; }
        .sys-header { text-align: center; margin-bottom: 20px; }
        .sys-title { font-size: 24px; margin: 10px 0; border-bottom: 2px solid var(--accent-color); display: inline-block; }
        .sys-desc { font-size: 14px; color: #666; min-height: 20px; margin-top: 8px; }
        .typewriter-text { border-right: 2px solid var(--accent-color); animation: blink 0.7s step-end infinite; }
        @keyframes blink { 50% { border-color: transparent; } }
        .api-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px; }
        .api-item { border: 1px solid #ddd; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: inherit; transition: all 0.2s ease; cursor: pointer; }
        .api-item:hover { border-color: var(--border-color); background: #fafafa; }
        .status-dot { height: 8px; width: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; }
        .on { background-color: #28a745; }
        .off { background-color: #dd4c4c; }
        .stats-info { margin-top: 15px; padding-top: 15px; border-top: 1px dashed #ddd; }
        .stats-info .stats-row {display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 14px; }
        .stats-label::before { content: "> "; color: var(--accent-color); font-weight: bold; }
        .stats-value b { color: #000; background: #f0f0f0; padding: 0 6px; border-radius: 2px; }
        .footer { margin-top: 50px; padding: 15px; border: 1px solid var(--border-color); text-align: center; font-size: 12px; color: #666; }
        .footer a { color: var(--text-color); text-decoration: none; font-weight: bold; border-bottom: 1px solid #ccc; padding: 0 2px; transition: 0.2s; }
        .footer a:hover { color: #fff; background-color: var(--border-color); border-bottom-color: var(--border-color); }
        hr { border: 0; border-top: 1px dashed #ccc; margin: 20px 0; }
        .cmd { color: var(--accent-color); }
        #intro-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #ffffff; display: flex; justify-content: center; align-items: center; z-index: 9999; transition: opacity 0.8s ease-out, visibility 0.8s ease-out; }
        #intro-overlay.fade-out { opacity: 0; visibility: hidden; }
        #intro-text { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace, 'Noto Serif SC', -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 20px; color: var(--text-color); border-right: 2px solid var(--accent-color); padding-right: 5px; animation: cursor-blink 0.7s step-end infinite; }
        @keyframes cursor-blink { 50% { border-color: transparent; } }
        #main-content {  opacity: 0; transition: opacity 0.6s ease-in; }
        #main-content.visible { opacity: 1; }
      </style>
    </head>
    <body>

      <div id="intro-overlay">
        <div id="intro-text"></div>
      </div>

      <div class="main-content" id="main-content"> 
        <div class="box">
          <div class="box-title">[OS] 系统信息</div>
          <div class="sys-header">
              <div class="sys-title">${siteName}</div>
              <div class="sys-desc"><span id="typewriter" class="typewriter-text"></span></div>
          </div>
          <div>操作系统: <span style="float:right">${osName}</span></div>
          <div>运行框架: <span style="float:right">Node.js / Hono</span></div>
          <div>系统时间: <span style="float:right">${currentTime}</span></div>
          <div>在线状态: <span style="float:right; color: #28a745;">[STATUS OK]</span></div>
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
            ${siteFooter}
          </span>
        </div>
      </div>

      <script>
        const descriptions = ${JSON.stringify(siteDescriptions)};

        (function() {
          const element = document.getElementById('typewriter');
          let textIndex = Math.floor(Math.random() * descriptions.length);
          let charIndex = 0;
          let isDeleting = false;
          let typeSpeed = 100;

          function typeWriter() {
            const currentText = descriptions[textIndex];
            
            if (isDeleting) {
              element.textContent = currentText.substring(0, charIndex - 1);
              charIndex--;
              typeSpeed = 50;
            } else {
              element.textContent = currentText.substring(0, charIndex + 1);
              charIndex++;
              typeSpeed = 100;
            }

            if (!isDeleting && charIndex === currentText.length) {
              typeSpeed = 2000;
              isDeleting = true;
            } else if (isDeleting && charIndex === 0) {
              isDeleting = false;
              textIndex = (Math.floor(Math.random() * descriptions.length)) % descriptions.length;
              typeSpeed = 500;
            }

            setTimeout(typeWriter, typeSpeed);
          }

          typeWriter();
        })();

        (function() {
          const introOverlay = document.getElementById('intro-overlay');
          const introText = document.getElementById('intro-text');
          const mainContent = document.getElementById('main-content');
          
          let descIndex = Math.floor(Math.random() * descriptions.length);
          let charIndex = 0;
          let typeSpeed = 80;

          function introTypeWriter() {
            const currentDesc = descriptions[descIndex];
            
            if (charIndex < currentDesc.length) {
              introText.textContent = currentDesc.substring(0, charIndex + 1);
              charIndex++;
              setTimeout(introTypeWriter, typeSpeed);
            } else {
              setTimeout(() => {
                introOverlay.classList.add('fade-out');
                setTimeout(() => {
                  mainContent.classList.add('visible');
                }, 300);
              }, 1000);
            }
          }

          setTimeout(introTypeWriter, 300);
        })();
      </script>

    </body>
    </html>
  `);
}