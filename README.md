# PublicAPI

自用的一些 API 接口。

## API 列表

### Meting

基于 [Meting](https://github.com/metowolf/meting) 实现的 API，支持网易云、QQ等音乐平台。

### Boring Avatar

基于 [Boring-avatars](https://github.com/boringdesigners/boring-avatars) 实现的头像生成 API，并集成了镜像源（[WeAvatar](https://weavatar.com/) 和 [Cravatar](https://cravatar.com/)）支持。

## 部署方式

### Docker Compose

```bash
wget https://raw.githubusercontent.com/Motues/PublicAPI/main/docker-compose.yml
docker compose up -d
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
| `ADMIN_PASSWORD` | 管理后台密码（明文），优先级最高 | 未设置 |
| `ADMIN_PASSWORD_HASH` | 管理后台密码的 scrypt 哈希，格式 `scrypt$salt$hash` | 未设置 |
| `ADMIN_SESSION_SECRET` | 管理后台会话签名密钥，不设置则自动生成并保存到 `data/config/admin.json` | 自动生成 |
| `ADMIN_SESSION_TTL` | 管理后台会话有效期（分钟） | `120` |
| `ADMIN_SETUP_REMOTE` | 设置为 `true` 时允许从公网完成首次密码初始化 | 关闭 |

## 管理后台

访问 `/admin` 即可实时修改配置，保存后立即生效，无需重启服务：

- `data/config/site.json`：站点名称、首页打字机描述、页脚文案
- `data/config/services.json`：首页服务目录的增删改
- `data/config/meting.json`：网易云 Cookie（保存后自动清理音乐相关缓存）

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
  "footer": "系统运行良好，欢迎使用！"
}
```

Made with ❤️ by [Motues](https://www.motues.top)

如果使用过程中存在问题，欢迎通过[邮件](mailto:me@motues.top)告诉我