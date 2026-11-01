# PublicAPI

自用的一些 API 接口。

## API 列表

### Meting

基于 [Meting](https://github.com/metowolf/meting) 实现的 API，支持网易云、QQ等音乐平台。

### Boring Avatar

基于 [Boring-avatars](https://github.com/boringdesigners/boring-avatars) 实现的头像生成 API，并集成了镜像源（[WeAvatar](https://weavatar.com/) 和 [Cravatar](https://cravatar.com/)）支持。

### Emoji

提供 OwO 格式的表情数据接口（参考 [owo.imaegoo.com/owo.json](https://owo.imaegoo.com/owo.json)），兼容 Twikoo、Artalk、Waline 等评论系统的自定义表情包；图片资源位于 `public/emoji/`，随仓库一起发布，由本站自己托管，不依赖第三方图床。

## 界面

首页、文档页与管理后台均为原生 HTML + 内联样式，并通过 `prefers-color-scheme` 跟随系统 / 浏览器的深色模式偏好自动切换配色，无需手动设置。

## 部署方式

### Docker Compose

```bash
wget https://raw.githubusercontent.com/Motues/PublicAPI/main/docker-compose.yml
docker compose up -d
```

镜像入口会先修正 `/app/data` 属主，再降权到 `node` 用户运行；如果自行覆盖 `entrypoint` 或使用只读挂载，请确保数据目录可写。构建阶段使用 `pnpm-lock.yaml` 与 `corepack`，避免依赖漂移。

镜像同时发布到两个官方镜像仓库，内容一致，按网络情况选择即可：

| 镜像仓库 | 镜像地址 |
| --- | --- |
| GitHub 容器镜像仓库（GHCR） | `ghcr.io/motues/publicapi` |
| Docker Hub | `motues/publicapi` |

支持的标签：`latest`（最新版本）、`0.2.4`（完整版本号）、`0.2`（次版本号，随补丁更新）。

```bash
# 直接拉取运行（以 Docker Hub 为例）
docker run -d --name public-api -p 3000:3000 \
  -e EMOJI=open \
  -v $(pwd)/data:/app/data \
  motues/publicapi:latest
```

### Node.js

```bash
git clone https://github.com/Motues/PublicAPI.git
cd PublicAPI
cp .env.example .env # 修改自己环境变量
pnpm install
pnpm start
```

## 配置参数

## 环境变量

需要在程序启动的时候确定，不支持热加载。

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 服务监听端口 | `3000` |
| `DATA_DIR` | 配置与会话数据目录 | `./data` |
| `PUBLIC_DIR` | 静态资源目录 | `./public` |
| `LOG_LEVEL` | 日志级别：`debug` / `info` / `warn` / `error` | `info` |
| `ALLOW_ORIGIN` | 公开接口允许跨域的源，多个用逗号分隔；留空或 `*` 表示允许所有，配置了但全部非法时按拒绝处理。公开接口不使用 Cookie | 空 |
| `MUSIC` | 设置为 `open` 启用音乐 API | 关闭 |
| `AVATAR` | 设置为 `open` 启用头像 API | 关闭 |
| `EMOJI` | 设置为 `open` 启用表情 API | 关闭 |
| `TRUST_PROXY` | 是否信任反向代理传来的客户端 IP 头（`X-Forwarded-For` / `X-Real-IP`）。默认关闭；直接暴露服务时不要开启 | 关闭 |
| `TRUSTED_PROXIES` | 可信代理地址，多个用逗号分隔（如 `127.0.0.1`）；配置后只接受这些代理的连接 | 空 |
| `TRUST_CLOUDFLARE` | 是否信任 `CF-Connecting-IP`（仅使用 Cloudflare 时开启） | 关闭 |
| `PUBLIC_ORIGIN` | 对外访问地址（如 `https://api.example.com`），用于生成绝对地址和后台同源校验；反向代理改写 Host 时建议设置 | 空 |
| `ADMIN_PASSWORD` | 管理后台密码（明文），优先级最高 | 未设置 |
| `ADMIN_PASSWORD_HASH` | 管理后台密码的 scrypt 哈希，格式 `scrypt$salt$hash` | 未设置 |
| `ADMIN_SESSION_SECRET` | 管理后台会话签名密钥，不设置则自动生成并保存到 `data/config/admin.json` | 自动生成 |
| `ADMIN_SESSION_TTL` | 管理后台会话有效期（分钟，最长 10080） | `120` |
| `ADMIN_SETUP_REMOTE` | 设置为 `true` 时允许从公网完成首次密码初始化 | 关闭 |
| `ADMIN_SETUP_TOKEN` | 首次初始化令牌；不设置则随机生成并打印到服务端日志 | 自动生成 |

> 部署在 Nginx / Caddy / Cloudflare 等反向代理之后时，必须设置 `TRUST_PROXY=true`，否则所有请求都会按代理的 socket IP 共享限流配额；同时建议设置 `TRUSTED_PROXIES`（例如 `127.0.0.1`）和 `PUBLIC_ORIGIN`。直接暴露到公网时保持 `TRUST_PROXY` 关闭，任何客户端都无法通过伪造 `X-Forwarded-For` 绕过限流或登录锁定。

## 管理后台

健康检查接口为 `GET /healthz`（不鉴权、不计数），Docker 镜像已配置 `HEALTHCHECK`。

首次部署且未配置 `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` 时，打开 `/admin` 会进入初始化页；需要填写服务端日志中的 `Admin setup token`（或预先设置 `ADMIN_SETUP_TOKEN`）。初始化完成后该页面自动关闭。退出登录会轮换会话密钥，使其他设备上的会话一并失效（若使用固定的 `ADMIN_SESSION_SECRET` 则只能清除当前浏览器）。

访问 `/admin` 即可实时修改配置，保存后立即生效，无需重启服务：

- `data/config/site.json`：站点名称、首页打字机描述、页脚文案、表情接口对外访问地址
- `data/config/services.json`：首页服务目录的增删改
- `data/config/meting.json`：网易云 Cookie（保存后自动清理音乐相关缓存）
- `data/config/emoji.json`：OwO 表情数据（保存后自动清理表情接口缓存；升级后新版本内置的分组会自动补齐到该文件，详见 [/docs/emoji](/docs/emoji)）

后台还提供「调用分析」面板：今日 / 累计调用量、近一分钟 QPS、近 7 / 30 / 90 天的按日趋势与端点分布，图表为内联 SVG，无额外依赖。

统计口径仅覆盖音乐 / 头像 / 表情接口（不含后台页面与静态资源），数据保存在 `data/stats/`；端点分布自该功能上线后开始累积，最多保留 90 天。

## 配置文件

存放于 `/data/config/` 文件夹中，支持热加载，修改后立刻生效，无需重新启动服务。。

如果需要添加站外链接，可以编辑 `/data/config/services.json` 文件。

```json
[
    {
        "name": "GitHub",
        "url": "https://github.com/Motues",
        "status": "open" // open | close
    },
    { ... }
]
```

如果需要设置站点信息，，可以编辑 `/data/config/site.json` 文件。

```json
{
  "siteName": "Public API",
  "description": [
    "A public API service for everyone.",
    "Welcome to use!"
  ],
  "footer": "系统运行良好，欢迎使用！",
  "emojiBaseUrl": "https://api.example.com"
}
```

`emojiBaseUrl` 为表情接口对外访问地址，留空表示按请求域名自动推导；填写时必须是 `http(s)` 的站点根地址（不能带路径），也可以在 `/admin` 后台修改。

如果需要管理表情数据，可以编辑 `/data/config/emoji.json` 文件（或在 `/admin` 后台的「表情数据」面板编辑）。

```json
{
  "Emoji": {
    "type": "emoji",
    "container": [
      { "icon": "😀", "text": "开心" }
    ]
  },
  "Bilibili": {
    "type": "image",
    "container": [
      { "icon": "<img src=\"/static/emoji/bilibili/6ea59c827c414b4a2955fe79e0f6fd3dcd515e24.png\">", "text": "doge" }
    ]
  }
}
```

图片表情文件放在 `public/emoji/<分组名小写>/` 下，通过 `/static/emoji/...` 访问，接口返回时会按请求域名补全为绝对地址；详细说明见 [/docs/emoji](/docs/emoji)。

Made with ❤️ by [Motues](https://www.motues.top)

如果使用过程中存在问题，欢迎通过[邮件](mailto:me@motues.top)告诉我