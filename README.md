# PublicAPI

自用的一些 API 接口。

## API 列表

### Meting

基于 [Meting](https://github.com/metowolf/meting) 的 实现的 API，支持网易云、QQ等音乐平台。

### Boring Avatar

基于 [boring-avatars](https://github.com/boringdesigners/boring-avatars) 实现的头像生成 API，并集成了 Cravatar 镜像源支持。

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

Made with ❤️ by [Motues](https://www.motues.top)

如果使用过程中存在问题，欢迎通过[邮件](mailto:me@motues.top)告诉我