import type { Context } from 'hono';
import { loadEmojiData, loadMetingSettings, loadServices, loadSiteConfig } from '../../utils/dataLoader.js';
import { getStats } from '../../utils/middleware/counter.js';
import {
  canUseSetupPage,
  getLoginLockStatus,
  getPasswordSource,
  getSessionTtlMinutes,
  isAuthenticated,
  isPasswordFromEnv,
  type PasswordSource,
} from '../../utils/adminAuth.js';
import { getSystemInfo } from '../../utils/systemInfo.js';
import { escapeHtml } from '../../utils/html.js';

/**
 * 管理后台页面 /admin
 *
 * 未配置密码时展示初始化页面（仅本机/内网），已配置密码时展示登录页，
 * 登录后展示控制台。页面风格与首页保持一致，首页不提供任何入口链接。
 */

const PAGE_STYLE = `
  :root { --border-color: #333; --bg-color: #ffffff; --text-color: #24292e; --accent-color: #067ece; --code-bg: #f6f8fa; }
  body { max-width: 780px; margin: 40px auto; padding: 20px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace, 'Noto Serif SC', -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif; background-color: var(--bg-color); color: var(--text-color); line-height: 1.5; }
  .box { border: 1px solid var(--border-color); padding: 20px; margin-bottom: 25px; position: relative; }
  .box-title { position: absolute; top: -12px; left: 20px; background: white; padding: 0 10px; font-size: 14px; font-weight: bold; }
  .sys-header { text-align: center; margin-bottom: 20px; }
  .sys-title { font-size: 24px; margin: 10px 0; border-bottom: 2px solid var(--accent-color); display: inline-block; }
  .sys-desc { font-size: 14px; color: #666; min-height: 20px; margin-top: 8px; }
  .stats-info { margin-top: 15px; padding-top: 15px; border-top: 1px dashed #ddd; }
  .stats-info .stats-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 14px; gap: 10px; }
  .stats-label::before { content: "> "; color: var(--accent-color); font-weight: bold; }
  .stats-value b { color: #000; background: #f0f0f0; padding: 0 6px; border-radius: 2px; }
  .field { margin-bottom: 14px; }
  .field > .stats-label { display: block; font-size: 14px; margin-bottom: 6px; }
  input[type=text], input[type=password], textarea, select { font-family: inherit; font-size: 14px; color: inherit; border: 1px solid #ddd; background: #fff; padding: 6px 8px; width: 100%; box-sizing: border-box; border-radius: 0; }
  input[type=text]:focus, input[type=password]:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent-color); }
  textarea { resize: vertical; min-height: 80px; line-height: 1.5; }
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 15px; }
  .btn { font-family: inherit; font-size: 13px; border: 1px solid var(--border-color); background: #fff; color: var(--text-color); padding: 6px 14px; cursor: pointer; transition: all 0.2s ease; text-decoration: none; display: inline-block; }
  .btn:hover { background: var(--border-color); color: #fff; }
  .btn.primary { border-color: var(--accent-color); color: var(--accent-color); }
  .btn.primary:hover { background: var(--accent-color); color: #fff; }
  .btn.danger { border-color: #dd4c4c; color: #dd4c4c; }
  .btn.danger:hover { background: #dd4c4c; color: #fff; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .msg { font-size: 13px; min-height: 18px; color: #666; }
  .msg.ok { color: #28a745; }
  .msg.err { color: #dd4c4c; }
  .hint { margin-top: 12px; font-size: 13px; color: #888; }
  .notice { border-left: 3px solid var(--accent-color); background: var(--code-bg); padding: 10px 14px; font-size: 13px; color: #444; margin-bottom: 15px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 25px; }
  .tab { font-family: inherit; font-size: 13px; border: 1px solid #ddd; background: #fff; color: inherit; padding: 8px 14px; cursor: pointer; transition: all 0.2s ease; }
  .tab:hover { border-color: var(--border-color); background: #fafafa; }
  .tab.active { border-color: var(--border-color); background: #fafafa; font-weight: bold; box-shadow: inset 0 -2px 0 var(--accent-color); }
  .panel { display: none; }
  .panel.active { display: block; }
  .svc-head, .svc-row { display: grid; grid-template-columns: 1fr 1.4fr auto auto; gap: 8px; align-items: center; }
  .svc-head { font-size: 12px; color: #888; margin-bottom: 6px; }
  .svc-row { margin-bottom: 8px; }
  .svc-row select { width: auto; }
  .svc-row .btn { white-space: nowrap; }
  .footer { margin-top: 25px; padding: 15px; border: 1px solid var(--border-color); text-align: center; font-size: 12px; color: #666; }
  .footer a { color: var(--text-color); text-decoration: none; font-weight: bold; border-bottom: 1px solid #ccc; padding: 0 2px; transition: 0.2s; }
  .footer a:hover { color: #fff; background-color: var(--border-color); border-bottom-color: var(--border-color); }
  hr { border: 0; border-top: 1px dashed #ccc; margin: 20px 0; }
  @media (max-width: 640px) { .svc-head { display: none; } .svc-row { grid-template-columns: 1fr; border: 1px dashed #ddd; padding: 10px; } }
`;

/** 客户端公共方法 */
const CLIENT_HELPERS = `
  function setMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg' + (ok === true ? ' ok' : ok === false ? ' err' : '');
  }

  async function adminFetch(path, options) {
    const opts = options || {};
    const res = await fetch('/admin/api' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }

    if (res.status === 401) {
      location.reload();
      return null;
    }
    if (!res.ok) {
      const err = new Error(data.error || ('请求失败 (' + res.status + ')'));
      err.retryAfter = data.retryAfter || 0;
      throw err;
    }
    return data;
  }
`;

const LOGIN_SCRIPT = `
(function () {
  ${CLIENT_HELPERS}

  const form = document.getElementById('login-form');
  if (!form) return;

  const input = document.getElementById('login-password');
  const button = document.getElementById('login-submit');
  const msg = document.getElementById('login-msg');
  let locked = false;

  function startCountdown(seconds) {
    locked = true;
    let left = seconds;
    button.disabled = true;
    input.disabled = true;
    setMsg(msg, '[LOCKED] 失败次数过多，请在 ' + left + ' 秒后重试', false);
    const timer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        locked = false;
        button.disabled = false;
        input.disabled = false;
        setMsg(msg, '可以重新尝试登录', null);
        return;
      }
      setMsg(msg, '[LOCKED] 失败次数过多，请在 ' + left + ' 秒后重试', false);
    }, 1000);
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (locked) return;

    button.disabled = true;
    setMsg(msg, '验证中…', null);

    try {
      await adminFetch('/login', { method: 'POST', body: { password: input.value } });
      setMsg(msg, '[OK] 验证通过，正在进入控制台…', true);
      location.reload();
    } catch (error) {
      if (error.retryAfter > 0) {
        startCountdown(error.retryAfter);
        return;
      }
      setMsg(msg, '[FAIL] ' + error.message, false);
      button.disabled = false;
      input.value = '';
      input.focus();
    }
  });
})();
`;

const SETUP_SCRIPT = `
(function () {
  ${CLIENT_HELPERS}

  const form = document.getElementById('setup-form');
  if (!form) return;

  const passwordInput = document.getElementById('setup-password');
  const confirmInput = document.getElementById('setup-confirm');
  const button = document.getElementById('setup-submit');
  const msg = document.getElementById('setup-msg');

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    if (passwordInput.value !== confirmInput.value) {
      setMsg(msg, '[FAIL] 两次输入的密码不一致', false);
      return;
    }

    button.disabled = true;
    setMsg(msg, '正在保存…', null);

    try {
      await adminFetch('/setup', {
        method: 'POST',
        body: { password: passwordInput.value, confirmPassword: confirmInput.value },
      });
      setMsg(msg, '[OK] 初始化完成，正在进入控制台…', true);
      location.reload();
    } catch (error) {
      setMsg(msg, '[FAIL] ' + error.message, false);
      button.disabled = false;
    }
  });
})();
`;

const PANEL_SCRIPT = `
(function () {
  ${CLIENT_HELPERS}

  const boot = JSON.parse(document.getElementById('bootstrap').textContent || '{}');

  // ---- 标签切换 ----
  const tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  const panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (item) { item.classList.toggle('active', item === tab); });
      panels.forEach(function (panel) { panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab); });
    });
  });

  // ---- 退出登录 ----
  const logoutButton = document.getElementById('logout');
  if (logoutButton) {
    logoutButton.addEventListener('click', async function () {
      logoutButton.disabled = true;
      try { await adminFetch('/logout', { method: 'POST' }); } catch (e) { /* 忽略 */ }
      location.href = '/admin';
    });
  }

  // ---- 站点信息 ----
  const site = boot.site || { siteName: '', description: [], footer: '' };
  const siteNameInput = document.getElementById('site-name');
  const siteDescriptionInput = document.getElementById('site-description');
  const siteFooterInput = document.getElementById('site-footer');

  if (siteNameInput) {
    siteNameInput.value = site.siteName || '';
    siteDescriptionInput.value = (site.description || []).join('\\n');
    siteFooterInput.value = site.footer || '';
  }

  const siteForm = document.getElementById('site-form');
  if (siteForm) {
    siteForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const msg = document.getElementById('site-msg');
      const descriptions = siteDescriptionInput.value.split('\\n').map(function (line) { return line.trim(); }).filter(function (line) { return line !== ''; });

      if (descriptions.length === 0) {
        setMsg(msg, '[FAIL] 描述至少需要保留一条内容', false);
        return;
      }

      setMsg(msg, '保存中…', null);
      try {
        await adminFetch('/config/site', {
          method: 'PUT',
          body: {
            siteName: siteNameInput.value,
            description: descriptions,
            footer: siteFooterInput.value,
          },
        });
        setMsg(msg, '[OK] 已保存，首页实时生效', true);
      } catch (error) {
        setMsg(msg, '[FAIL] ' + error.message, false);
      }
    });
  }

  // ---- 服务目录 ----
  const servicesBody = document.getElementById('services-body');

  function createServiceRow(service) {
    const row = document.createElement('div');
    row.className = 'svc-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'svc-name';
    nameInput.placeholder = '[Web] 服务名称';
    nameInput.maxLength = 100;

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'svc-url';
    urlInput.placeholder = 'https://example.com';
    urlInput.maxLength = 500;

    const statusSelect = document.createElement('select');
    statusSelect.className = 'svc-status';
    ['open', 'closed'].forEach(function (value) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      statusSelect.appendChild(option);
    });

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn danger svc-del';
    removeButton.textContent = '删除';
    removeButton.addEventListener('click', function () { row.remove(); });

    nameInput.value = (service && service.name) || '';
    urlInput.value = (service && service.url) || '';
    statusSelect.value = (service && service.status) === 'closed' ? 'closed' : 'open';

    row.appendChild(nameInput);
    row.appendChild(urlInput);
    row.appendChild(statusSelect);
    row.appendChild(removeButton);
    return row;
  }

  if (servicesBody) {
    (boot.services || []).forEach(function (service) {
      servicesBody.appendChild(createServiceRow(service));
    });

    const addButton = document.getElementById('add-service');
    addButton.addEventListener('click', function () {
      servicesBody.appendChild(createServiceRow(null));
      const rows = servicesBody.querySelectorAll('.svc-name');
      const last = rows[rows.length - 1];
      if (last) last.focus();
    });

    const saveButton = document.getElementById('save-services');
    saveButton.addEventListener('click', async function () {
      const msg = document.getElementById('services-msg');
      const services = Array.prototype.slice.call(servicesBody.querySelectorAll('.svc-row')).map(function (row) {
        return {
          name: row.querySelector('.svc-name').value.trim(),
          url: row.querySelector('.svc-url').value.trim(),
          status: row.querySelector('.svc-status').value,
        };
      }).filter(function (service) { return service.name !== '' || service.url !== ''; });

      const invalid = services.find(function (service) { return service.name === '' || service.url === ''; });
      if (invalid) {
        setMsg(msg, '[FAIL] 服务名称和链接都不能为空', false);
        return;
      }

      saveButton.disabled = true;
      setMsg(msg, '保存中…', null);
      try {
        await adminFetch('/config/services', { method: 'PUT', body: { services: services } });
        setMsg(msg, '[OK] 已保存 ' + services.length + ' 项，首页实时生效', true);
      } catch (error) {
        setMsg(msg, '[FAIL] ' + error.message, false);
      }
      saveButton.disabled = false;
    });
  }

  // ---- 音乐设置 ----
  const cookieInput = document.getElementById('meting-cookie');
  if (cookieInput) {
    cookieInput.value = (boot.meting && boot.meting.cookie) || '';

    const saveMetingButton = document.getElementById('save-meting');
    saveMetingButton.addEventListener('click', async function () {
      const msg = document.getElementById('meting-msg');
      saveMetingButton.disabled = true;
      setMsg(msg, '保存中…', null);
      try {
        await adminFetch('/config/meting', { method: 'PUT', body: { cookie: cookieInput.value } });
        setMsg(msg, '[OK] 已保存，音乐缓存已清理', true);
      } catch (error) {
        setMsg(msg, '[FAIL] ' + error.message, false);
      }
      saveMetingButton.disabled = false;
    });
  }

  // ---- 表情接口设置 ----
  const baseUrlInput = document.getElementById('emoji-base-url');
  if (baseUrlInput) {
    baseUrlInput.value = (boot.site && boot.site.emojiBaseUrl) || '';

    const saveBaseUrlButton = document.getElementById('save-emoji-base-url');
    saveBaseUrlButton.addEventListener('click', async function () {
      const msg = document.getElementById('emoji-base-url-msg');
      saveBaseUrlButton.disabled = true;
      setMsg(msg, '保存中…', null);
      try {
        const payload = await adminFetch('/config/site', {
          method: 'PUT',
          body: { emojiBaseUrl: baseUrlInput.value },
        });
        baseUrlInput.value = (payload && payload.data && payload.data.emojiBaseUrl) || '';
        setMsg(msg, '[OK] 已保存，表情接口缓存已清理', true);
      } catch (error) {
        setMsg(msg, '[FAIL] ' + error.message, false);
      }
      saveBaseUrlButton.disabled = false;
    });
  }

  // ---- 表情数据 ----
  const emojiEditor = document.getElementById('emoji-editor');
  if (emojiEditor) {
    const emojiMsg = document.getElementById('emoji-msg');
    emojiEditor.value = JSON.stringify(boot.emoji || {}, null, 2);

    const formatEmojiButton = document.getElementById('format-emoji');
    if (formatEmojiButton) {
      formatEmojiButton.addEventListener('click', function () {
        try {
          emojiEditor.value = JSON.stringify(JSON.parse(emojiEditor.value), null, 2);
          setMsg(emojiMsg, '[OK] 已格式化', true);
        } catch (error) {
          setMsg(emojiMsg, '[FAIL] JSON 格式错误：' + error.message, false);
        }
      });
    }

    const reloadEmojiButton = document.getElementById('reload-emoji');
    if (reloadEmojiButton) {
      reloadEmojiButton.addEventListener('click', async function () {
        reloadEmojiButton.disabled = true;
        setMsg(emojiMsg, '载入中…', null);
        try {
          const config = await adminFetch('/config');
          emojiEditor.value = JSON.stringify((config && config.emoji) || {}, null, 2);
          setMsg(emojiMsg, '[OK] 已重新载入服务端数据', true);
        } catch (error) {
          setMsg(emojiMsg, '[FAIL] ' + error.message, false);
        }
        reloadEmojiButton.disabled = false;
      });
    }

    const saveEmojiButton = document.getElementById('save-emoji');
    saveEmojiButton.addEventListener('click', async function () {
      let parsed;
      try {
        parsed = JSON.parse(emojiEditor.value);
      } catch (error) {
        setMsg(emojiMsg, '[FAIL] JSON 格式错误：' + error.message, false);
        return;
      }

      saveEmojiButton.disabled = true;
      setMsg(emojiMsg, '保存中…', null);
      try {
        await adminFetch('/config/emoji', { method: 'PUT', body: { emoji: parsed } });
        setMsg(emojiMsg, '[OK] 已保存，表情接口缓存已清理', true);
      } catch (error) {
        setMsg(emojiMsg, '[FAIL] ' + error.message, false);
      }
      saveEmojiButton.disabled = false;
    });
  }

  // ---- 修改密码 ----
  const passwordForm = document.getElementById('password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const msg = document.getElementById('password-msg');
      const currentInput = document.getElementById('password-current');
      const newInput = document.getElementById('password-new');
      const confirmInput = document.getElementById('password-confirm');

      if (newInput.value !== confirmInput.value) {
        setMsg(msg, '[FAIL] 两次输入的新密码不一致', false);
        return;
      }

      setMsg(msg, '保存中…', null);
      try {
        await adminFetch('/password', {
          method: 'POST',
          body: {
            currentPassword: currentInput.value,
            newPassword: newInput.value,
            confirmPassword: confirmInput.value,
          },
        });
        currentInput.value = '';
        newInput.value = '';
        confirmInput.value = '';
        setMsg(msg, '[OK] 密码已更新，其他设备的会话已失效', true);
      } catch (error) {
        setMsg(msg, '[FAIL] ' + error.message, false);
      }
    });
  }

  // ---- 清理缓存 ----
  const clearCacheButton = document.getElementById('clear-cache');
  if (clearCacheButton) {
    clearCacheButton.addEventListener('click', async function () {
      const msg = document.getElementById('cache-msg');
      clearCacheButton.disabled = true;
      setMsg(msg, '清理中…', null);
      try {
        const data = await adminFetch('/cache/clear', { method: 'POST' });
        setMsg(msg, '[OK] 已清理响应缓存 ' + data.clearedResponses + ' 条 / 音乐信息 ' + data.clearedSongs + ' 条', true);
      } catch (error) {
        setMsg(msg, '[FAIL] ' + error.message, false);
      }
      clearCacheButton.disabled = false;
    });
  }
})();
`;

/** 页面外壳，复用首页的终端风格 */
const pageShell = (title: string, body: string, script: string): string => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
${body}
  <div class="footer">
    © ${new Date().getFullYear()} <a href="https://github.com/Motues/PublicAPI" target="_blank">Public API</a>
    <br>
    <span style="opacity: 0.8; margin-top: 8px; display: inline-block;">
      [ADMIN] 该入口不会出现在首页，请妥善保管地址与密码
    </span>
  </div>
${script ? `  <script>${script}</script>` : ''}
</body>
</html>`;

const passwordSourceLabel = (source: PasswordSource): string => {
  switch (source) {
    case 'env-password':
      return '环境变量 ADMIN_PASSWORD';
    case 'env-hash':
      return '环境变量 ADMIN_PASSWORD_HASH';
    case 'file':
      return 'data/config/admin.json';
    default:
      return '未配置';
  }
};

/** 登录视图 */
const loginView = (siteName: string, lockSeconds: number): string => `
  <div class="box">
    <div class="box-title">[ADMIN] 身份验证</div>
    <div class="sys-header">
      <div class="sys-title">${siteName}</div>
      <div class="sys-desc">管理控制台 · 需要管理员密码</div>
    </div>
    <form id="login-form">
      <div class="field">
        <label class="stats-label" for="login-password">管理员密码</label>
        <input id="login-password" type="password" autocomplete="current-password" autofocus>
      </div>
      <div class="actions">
        <button class="btn primary" type="submit" id="login-submit">登录</button>
        <span class="msg" id="login-msg">${lockSeconds > 0 ? `[LOCKED] 失败次数过多，请在 ${lockSeconds} 秒后重试` : ''}</span>
      </div>
    </form>
    <div class="hint">* 密码来源：环境变量 ADMIN_PASSWORD / ADMIN_PASSWORD_HASH，或 data/config/admin.json</div>
  </div>
`;

/** 初始化密码视图（仅本机/内网） */
const setupView = (siteName: string): string => `
  <div class="box">
    <div class="box-title">[SETUP] 初始化管理员密码</div>
    <div class="sys-header">
      <div class="sys-title">${siteName}</div>
      <div class="sys-desc">首次使用 · 请设置管理后台密码</div>
    </div>
    <div class="notice">
      当前未配置任何管理员密码。设置后将写入 <b>data/config/admin.json</b>（scrypt 哈希存储），也可以改为在环境变量中配置。
    </div>
    <form id="setup-form">
      <div class="field">
        <label class="stats-label" for="setup-password">新密码（至少 8 位）</label>
        <input id="setup-password" type="password" autocomplete="new-password" autofocus>
      </div>
      <div class="field">
        <label class="stats-label" for="setup-confirm">确认密码</label>
        <input id="setup-confirm" type="password" autocomplete="new-password">
      </div>
      <div class="actions">
        <button class="btn primary" type="submit" id="setup-submit">设置密码并进入</button>
        <span class="msg" id="setup-msg"></span>
      </div>
    </form>
  </div>
`;

/** 未配置密码但来源不安全的提示视图 */
const setupBlockedView = (siteName: string): string => `
  <div class="box">
    <div class="box-title">[SETUP] 尚未配置管理员密码</div>
    <div class="sys-header">
      <div class="sys-title">${siteName}</div>
      <div class="sys-desc">管理控制台暂不可用</div>
    </div>
    <div class="notice">
      出于安全考虑，密码初始化只允许本机或内网地址访问。请在环境变量中配置管理员密码后重启服务：
    </div>
    <div class="field">
      <label class="stats-label">.env 或 docker 环境变量</label>
      <textarea rows="3" readonly>ADMIN_PASSWORD=你的密码
# 或使用哈希（推荐）：ADMIN_PASSWORD_HASH=scrypt$salt$hash</textarea>
    </div>
    <div class="hint">
      * 如确需从公网完成初始化，可临时设置 ADMIN_SETUP_REMOTE=true 后重启服务，初始化完成后请立即移除。
    </div>
  </div>
`;

interface PanelOptions {
  site: { siteName: string; description: string[]; footer: string; emojiBaseUrl: string };
  services: unknown;
  meting: unknown;
  emoji: unknown;
  passwordSource: PasswordSource;
  passwordFromEnv: boolean;
  sessionTtlMinutes: number;
  stats: { total: number; today: number };
  system: { osName: string; nodeVersion: string };
}

/** 控制台视图 */
const panelView = (options: PanelOptions): string => {
  const { site, passwordSource, passwordFromEnv, sessionTtlMinutes, stats, system } = options;

  const bootstrap = JSON.stringify({
    site,
    services: options.services,
    meting: options.meting,
    emoji: options.emoji,
  }).replace(/</g, '\\u003c');

  const securityBody = passwordFromEnv
    ? `<div class="notice">
        当前密码由 ${escapeHtml(passwordSourceLabel(passwordSource))} 控制，无法在后台修改。<br>
        如需更换密码，请修改环境变量后重启服务（docker 用户可修改 compose 文件中的 environment）。
       </div>`
    : `<form id="password-form">
        <div class="field">
          <label class="stats-label" for="password-current">当前密码</label>
          <input id="password-current" type="password" autocomplete="current-password">
        </div>
        <div class="field">
          <label class="stats-label" for="password-new">新密码（至少 8 位）</label>
          <input id="password-new" type="password" autocomplete="new-password">
        </div>
        <div class="field">
          <label class="stats-label" for="password-confirm">确认新密码</label>
          <input id="password-confirm" type="password" autocomplete="new-password">
        </div>
        <div class="actions">
          <button class="btn primary" type="submit">更新密码</button>
          <span class="msg" id="password-msg"></span>
        </div>
        <div class="hint">* 密码以 scrypt 哈希保存在 data/config/admin.json；更新后其他设备上的会话会立即失效。</div>
      </form>`;

  return `
  <div class="box">
    <div class="box-title">[ADMIN] 管理控制台</div>
    <div class="sys-header">
      <div class="sys-title">${escapeHtml(site.siteName || 'Public API Server')}</div>
      <div class="sys-desc">配置修改后立即生效，无需重启服务</div>
    </div>
    <div>登录状态: <span style="float:right; color: #28a745;">[AUTHENTICATED]</span></div>
    <div>密码来源: <span style="float:right">${escapeHtml(passwordSourceLabel(passwordSource))}</span></div>
    <div>会话有效期: <span style="float:right">${sessionTtlMinutes} 分钟</span></div>
    <div class="stats-info">
      <div class="stats-row">
        <span class="stats-label">总请求数</span>
        <span class="stats-value"><b>${stats.total}</b> 次</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">今日请求数</span>
        <span class="stats-value"><b>${stats.today}</b> 次</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">操作系统</span>
        <span class="stats-value">${escapeHtml(system.osName)}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">运行环境</span>
        <span class="stats-value">Node ${escapeHtml(system.nodeVersion)} / Hono</span>
      </div>
    </div>
    <div class="actions">
      <a class="btn" href="/" target="_blank">查看首页</a>
      <button class="btn danger" type="button" id="logout">退出登录</button>
    </div>
  </div>

  <div class="tabs">
    <button class="tab active" type="button" data-tab="site">[SITE] 站点信息</button>
    <button class="tab" type="button" data-tab="services">[LIST] 服务目录</button>
    <button class="tab" type="button" data-tab="meting">[MUSIC] 音乐设置</button>
    <button class="tab" type="button" data-tab="emoji">[EMOJI] 表情数据</button>
    <button class="tab" type="button" data-tab="security">[SEC] 安全设置</button>
  </div>

  <div class="panel active" data-panel="site">
    <div class="box">
      <div class="box-title">[SITE] 站点信息 · data/config/site.json</div>
      <form id="site-form">
        <div class="field">
          <label class="stats-label" for="site-name">站点名称</label>
          <input id="site-name" type="text" maxlength="100" placeholder="Public API Server">
        </div>
        <div class="field">
          <label class="stats-label" for="site-description">打字机描述（每行一条，首页随机轮播）</label>
          <textarea id="site-description" rows="7" spellcheck="false" placeholder="A public API server for everyone."></textarea>
        </div>
        <div class="field">
          <label class="stats-label" for="site-footer">页脚文案</label>
          <input id="site-footer" type="text" maxlength="300" placeholder="系统运行良好，欢迎使用！">
        </div>
        <div class="actions">
          <button class="btn primary" type="submit">保存并生效</button>
          <span class="msg" id="site-msg"></span>
        </div>
      </form>
    </div>
  </div>

  <div class="panel" data-panel="services">
    <div class="box">
      <div class="box-title">[LIST] 服务目录 · data/config/services.json</div>
      <div class="svc-head">
        <span>名称</span>
        <span>链接</span>
        <span>状态</span>
        <span></span>
      </div>
      <div id="services-body"></div>
      <div class="actions">
        <button class="btn" type="button" id="add-service">+ 添加服务</button>
        <button class="btn primary" type="button" id="save-services">保存并生效</button>
        <span class="msg" id="services-msg"></span>
      </div>
      <div class="hint">* 链接支持 http(s) 或 / 开头的站内路径；状态为 closed 时首页显示红点。</div>
    </div>
  </div>

  <div class="panel" data-panel="meting">
    <div class="box">
      <div class="box-title">[MUSIC] 音乐设置 · data/config/meting.json</div>
      <div class="field">
        <label class="stats-label" for="meting-cookie">网易云 Cookie（留空表示不使用）</label>
        <textarea id="meting-cookie" rows="7" spellcheck="false" placeholder="MUSIC_U=...; __csrf=..."></textarea>
      </div>
      <div class="actions">
        <button class="btn primary" type="button" id="save-meting">保存并生效</button>
        <span class="msg" id="meting-msg"></span>
      </div>
      <div class="hint">* 保存后会立即清理音乐接口缓存；Cookie 属于敏感信息，请勿分享该页面。</div>
    </div>
  </div>

  <div class="panel" data-panel="emoji">
    <div class="box">
      <div class="box-title">[EMOJI] 接口设置 · data/config/site.json</div>
      <div class="field">
        <label class="stats-label" for="emoji-base-url">对外访问地址（留空则按请求域名自动推导）</label>
        <input id="emoji-base-url" type="text" maxlength="500" placeholder="https://api.example.com">
      </div>
      <div class="actions">
        <button class="btn primary" type="button" id="save-emoji-base-url">保存并生效</button>
        <span class="msg" id="emoji-base-url-msg"></span>
      </div>
      <div class="hint">
        * 设置后图片表情一律使用该地址前缀（反向代理未传递 X-Forwarded-Proto 时建议显式配置）；<br>
        留空时按 X-Forwarded-Proto / X-Forwarded-Host / 请求域名推导。
      </div>
    </div>
    <div class="box">
      <div class="box-title">[EMOJI] 表情数据 · data/config/emoji.json</div>
      <div class="notice">
        OwO 格式：{ "分组名": { "type": "emoticon | emoji | image", "container": [{ "icon": "...", "text": "..." }] } }，兼容 Twikoo / Artalk / Waline。<br>
        图片表情的 icon 写成 &lt;img src="/static/emoji/&lt;分组目录&gt;/&lt;文件名&gt;"&gt;，接口返回时会按请求域名自动补全为绝对地址。
      </div>
      <div class="field">
        <label class="stats-label" for="emoji-editor">表情数据（JSON）</label>
        <textarea id="emoji-editor" rows="18" spellcheck="false"></textarea>
      </div>
      <div class="actions">
        <button class="btn" type="button" id="format-emoji">格式化</button>
        <button class="btn" type="button" id="reload-emoji">重新载入</button>
        <button class="btn primary" type="button" id="save-emoji">保存并生效</button>
        <span class="msg" id="emoji-msg"></span>
      </div>
      <div class="hint">* 保存后会立即清理表情接口缓存；图片文件放在 public/emoji/ 下，通过 /static/emoji/... 访问，详见 /docs/emoji。</div>
    </div>
  </div>

  <div class="panel" data-panel="security">
    <div class="box">
      <div class="box-title">[SEC] 安全设置</div>
      ${securityBody}
      <hr>
      <div class="actions">
        <button class="btn" type="button" id="clear-cache">清理接口缓存</button>
        <span class="msg" id="cache-msg"></span>
      </div>
      <div class="hint">* 修改音乐 Cookie 后如果数据未更新，可手动清理缓存。</div>
    </div>
  </div>

  <script type="application/json" id="bootstrap">${bootstrap}</script>
`;
};

export const adminPage = async (c: Context) => {
  const siteConfig = loadSiteConfig();
  const siteName = escapeHtml(siteConfig.siteName || 'Public API Server');
  const passwordSource = getPasswordSource();

  // 管理后台页面不缓存
  c.header('Cache-Control', 'no-store');

  if (isAuthenticated(c)) {
    const stats = await getStats();
    const system = getSystemInfo();

    return c.html(pageShell(`[ADMIN] ${siteName}`, panelView({
      site: {
        siteName: siteConfig.siteName,
        description: siteConfig.description,
        footer: siteConfig.footer,
        emojiBaseUrl: siteConfig.emojiBaseUrl,
      },
      services: loadServices(),
      meting: loadMetingSettings(),
      emoji: loadEmojiData(),
      passwordSource,
      passwordFromEnv: isPasswordFromEnv(),
      sessionTtlMinutes: getSessionTtlMinutes(),
      stats,
      system: { osName: system.osName, nodeVersion: system.nodeVersion },
    }), PANEL_SCRIPT));
  }

  if (passwordSource === 'unset') {
    return canUseSetupPage(c)
      ? c.html(pageShell(`[SETUP] ${siteName}`, setupView(siteName), SETUP_SCRIPT))
      : c.html(pageShell(`[SETUP] ${siteName}`, setupBlockedView(siteName), ''));
  }

  return c.html(pageShell(`[ADMIN] ${siteName}`, loginView(siteName, getLoginLockStatus(c).retryAfterSeconds), LOGIN_SCRIPT));
};
