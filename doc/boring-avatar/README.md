# Boring Avatars API 

基于 [boring-avatars](https://github.com/boringdesigners/boring-avatars) 实现的头像生成 API，并集成了 Cravatar 镜像源支持。

## 参数说明

`/avatar?name=[name]&variant=[variant]&size=[size]&colors=[colors]&square=[square]&mode=[mode]`

### name

- **必填参数**：用于生成头像的种子字符串（Seed）。
- 在 `mode=cravatar` 时，此参数应传入用户的 **Email 地址的 MD5 哈希值**以匹配 Cravatar。

### mode

- **可选参数**：设置头像获取模式。
- 可选值：
   - `generate` (默认)：直接根据 `name` 渲染 SVG 头像。
   - `cravatar`：混合模式，先检测 Cravatar 是否存在该用户的自定义头像，若有则返回 Cravatar 的头像地址；若用户未设置（返回默认底图），则回退到本地生成的 SVG 头像。

### variant

- **可选参数**：设置生成头像的艺术风格。
- 可选值：`marble` (默认), `beam`, `pixel`, `sunset`, `ring`, `bauhaus`

### size

- **可选参数**：设置头像尺寸。
- 默认值：`200`

### colors

- **可选参数**：自定义本地生成头像的配色。
- 格式：多个十六进制颜色代码以逗号分隔（无需带 `#`）。

---

## 请求示例

### 1. 混合模式 (Cravatar 优先)

如果该邮箱在 Cravatar 注册过头像，则返回其头像；否则返回生成的 `beam` 风格头像。

- 请求示例：[/avatar?name=bcd70f6fc01024be21b4df73081d38ee&mode=cravatar&variant=beam](/avatar?name=bcd70f6fc01024be21b4df73081d38ee&mode=cravatar&variant=beam)

### 2. 基础生成模式 (Direct Generate)

不经过 Cravatar 检测，直接根据名称生成像素风头像。

- 请求示例：[/avatar?name=Gemini&variant=pixel](/avatar?name=Gemini&variant=pixel)

### 3. 自定义配色与形状 (Size & Square)

- 请求示例：[/avatar?name=Motues&size=120&square=true&colors=264653,2a9d8f,e9c46a](/avatar?name=Motues&size=120&square=true&colors=264653,2a9d8f,e9c46a)

Made with ❤️ by [Motues](https://www.motues.top)

如果使用过程中存在问题，欢迎通过[邮件](mailto:me@motues.top)告诉我