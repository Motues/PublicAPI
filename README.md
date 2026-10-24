# PublicAPI

自用的一些 API 接口。

## API 列表

### Meting

基于 [Meting](https://github.com/metowolf/meting) 实现的 API，支持网易云、QQ等音乐平台。

### Boring Avatar

基于 [Boring-avatars](https://github.com/boringdesigners/boring-avatars) 实现的头像生成 API，并集成了镜像源（[WeAvatar](https://weavatar.com/) 和 [Cravatar](https://cravatar.com/)）支持。

### Emoji

提供 OwO 格式的表情数据接口（参考 [owo.imaegoo.com/owo.json](https://owo.imaegoo.com/owo.json)），兼容 Twikoo、Artalk、Waline 等评论系统的自定义表情包；图片资源位于 `public/emoji/`，随仓库一起发布，由本站自己托管，不依赖第三方图床。

## 部署方式

### Docker Compose

```bash
wget https://raw.githubusercontent.com/Motues/PublicAPI/main/docker-compose.yml
docker compose up -d
```

镜像同时发布到两个官方镜像仓库，内容一致，按网络情况选择即可：

| 镜像仓库 | 镜像地址 |
| --- | --- |
| GitHub 容器镜像仓库（GHCR） | `ghcr.io/motues/publicapi` |
| Docker Hub | `motues/publicapi` |

支持的标签：`latest`（最新版本）、`0.2.1`（完整版本号）、`0.2`（次版本号，随补丁更新）。

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
| `ALLOW_ORIGIN` | 允许跨域的源，多个用逗号分隔，留空表示允许所有 | 空 |
| `MUSIC` | 设置为 `open` 启用音乐 API | 关闭 |
| `AVATAR` | 设置为 `open` 启用头像 API | 关闭 |
| `EMOJI` | 设置为 `open` 启用表情 API | 关闭 |
| `ADMIN_PASSWORD` | 管理后台密码（明文），优先级最高 | 未设置 |
| `ADMIN_PASSWORD_HASH` | 管理后台密码的 scrypt 哈希，格式 `scrypt$salt$hash` | 未设置 |
| `ADMIN_SESSION_SECRET` | 管理后台会话签名密钥，不设置则自动生成并保存到 `data/config/admin.json` | 自动生成 |
| `ADMIN_SESSION_TTL` | 管理后台会话有效期（分钟） | `120` |
| `ADMIN_SETUP_REMOTE` | 设置为 `true` 时允许从公网完成首次密码初始化 | 关闭 |

## 管理后台

访问 `/admin` 即可实时修改配置，保存后立即生效，无需重启服务：

- `data/config/site.json`：站点名称、首页打字机描述、页脚文案、表情接口对外访问地址
- `data/config/services.json`：首页服务目录的增删改
- `data/config/meting.json`：网易云 Cookie（保存后自动清理音乐相关缓存）
- `data/config/emoji.json`：OwO 表情数据（保存后自动清理表情接口缓存）

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