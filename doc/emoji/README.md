# Emoji API

OwO 格式的表情数据接口，兼容 [Twikoo](https://github.com/imaegoo/twikoo)、[Artalk](https://github.com/ArtalkJS/Artalk)、[Waline](https://github.com/walinejs/waline) 等评论系统的自定义表情包配置（参考 [owo.imaegoo.com/owo.json](https://owo.imaegoo.com/owo.json)）。

## 接口说明

| 接口 | 说明 |
| --- | --- |
| `/emoji/owo.json` | 返回全部表情分组 |
| `/emoji` | 同上（别名） |
| `/emoji/owo.json?group=Bilibili` | 只返回指定分组 |

请求示例：[/emoji/owo.json](/emoji/owo.json)、[/emoji/owo.json?group=Emoji](/emoji/owo.json?group=Emoji)

当前内置分组：`颜文字`、`Emoji`、`Bilibili`、`QQ`、`小黑盒`。

## 返回格式

顶层为「分组名」，`type` 为表情类型，`container` 为该分组下的表情列表：

```json
{
  "颜文字": {
    "type": "emoticon",
    "container": [
      { "icon": "OωO", "text": "Author: DIYgod" },
      { "icon": "(☆ω☆)", "text": "星星眼" }
    ]
  },
  "Emoji": {
    "type": "emoji",
    "container": [
      { "icon": "😀", "text": "开心" }
    ]
  },
  "Bilibili": {
    "type": "image",
    "container": [
      { "icon": "<img src=\"https://api.example.com/static/emoji/bilibili/6ea59c827c414b4a2955fe79e0f6fd3dcd515e24.png\">", "text": "doge" }
    ]
  }
}
```

### type

- `emoticon`：颜文字，`icon` 直接是文本
- `emoji`：Emoji 字符，`icon` 直接是字符
- `image`：图片表情，`icon` 为 `<img src="...">` 标签，其中 `src` 是本服务的完整图片地址

### group

- 可选参数，按分组名精确匹配（需要 URL 编码，如 `?group=%E9%A2%9C%E6%96%87%E5%AD%97`）
- 分组不存在时返回 `404`，并在响应中给出全部分组名

Made with ❤️ by [Motues](https://www.motues.top)

如果使用过程中存在问题，欢迎通过[邮件](mailto:me@motues.top)告诉我
