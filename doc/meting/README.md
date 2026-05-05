# Meting API

基于 [Meting](https://github.com/metowolf/meting) 的 实现的 API，支持网易云、QQ等音乐平台

## 参数说明

`/music?server=[server]&type=[type]&id=[id]`

### serer

- 可选参数：`netease`, `tencent`, `kugou`, `baidu`, `kuwo`
- 如果不设置，则默认为 `netease`

### id

- 必填参数，如果没有特别强调，均为歌曲对应的 ID

### type

- 可选参数包括：`details`，`name`，`artist`，`url`，`cover`，`lyric`，`playlist`，`search`

#### details

获取歌曲详细信息，请求示例：[/music?server=netease&type=details&id=30431366](/music?server=netease&type=details&id=30431366)

返回结果：

```json
{
    "id": 30431366,
    "name": "奇妙能力歌",
    "artist": [ "陈粒" ],
    "album": "如也",
    "pic_id": "7721870161993398",
    "url_id": 30431366,
    "lyric_id": 30431366,
    "source": "netease"
}
```

#### name

获取歌曲名称，请求示例：[/music?server=netease&type=name&id=30431366](/music?server=netease&type=name&id=30431366)

返回结果：

```json
{
  "name": "奇妙能力歌"
}
```

#### artist

获取歌曲作者，请求示例：[/music?server=netease&type=artist&id=30431366](/music?server=netease&type=artist&id=30431366)

返回结果：

```json
{
  "artist": [ "陈粒" ]
}
```

#### url

获取歌曲 URL，请求示例：[/music?server=netease&type=url&id=30431366&br=320](/music?server=netease&type=url&id=30431366&br=320)

可以通过参数 `br` 来设置歌曲的音质，默认为 `320`

```json
{
  "url": "http://m702.music.126.net/20260409171442/160cf630622a01f45f7924cf5a81f8b5/jd-musicrep-ts/c91d/1811/14bc/8ed7356baf5f6ca3be9717c28af7b5bc.mp3?vuutv=iczAwnRuckC+Ka/1FzoDMrKAqIya+xRsI1uqLoABbwH3KhEMQP0FGLHK1ZDMW0DiJcvmNltU9O+qr2QflLy0c+qCNR+/02mODvUwKRRkq1RBYm1st6Mg9awWZtyOA7BlpDNsEa5o41FlcUBohi6/+g==",
  "size": 481115,
  "br": 128.012
}
```

> 该接口目前拥有 VIP 权限，默认 `br` 默认为 320，如果失效请联系管理员设置 cookie

#### cover

获取歌曲封面，请求示例：[/music?server=netease&type=cover&id=30431366&size=300](/music?server=netease&type=cover&id=30431366&size=300)

> **注意**：id为歌曲的id，不是图片的id

返回结果：

```json
{
    "url": "https://p3.music.126.net/VuJFMbXzpAProbJPoXLv7g==/7721870161993398.jpg?param=300y300"
}
```

#### lyric

获取歌词，请求示例：[/music?server=netease&type=lyric&id=30431366](/music?server=netease&type=lyric&id=30431366)

返回结果：

```json
{
  "lyric": "[00:00.000] 作词 : 陈粒\n[00:01.000] 作曲 : 陈粒\n[00:10.312]编曲：燕池\n[00:20.312]我看过沙漠下暴雨\n[00:24.862]看过大海亲吻鲨鱼\n[00:29.113]看过黄昏追逐黎明\n[00:32.263]没看过你\n[00:37.664]我知道美丽会老去\n[00:41.765]生命之外还有生命\n[00:46.266]我知道风里有诗句\n[00:49.617]不知道你\n[00:55.169]我听过荒芜变成热闹\n[00:59.519]听过尘埃掩埋城堡\n[01:03.869]听过天空拒绝飞鸟\n[01:07.170]没听过你\n[01:12.621]我明白眼前都是气泡\n[01:16.721]安静的才是苦口良药\n[01:21.272]明白什么才让我骄傲\n[01:24.472]不明白你\n[01:30.273]我拒绝更好更圆的月亮\n[01:34.573]拒绝未知的疯狂\n[01:38.923]拒绝声色的张扬\n[01:42.240]不拒绝你\n[01:47.574]我变成荒凉的景象\n[01:51.976]变成无所谓的模样\n[01:55.777]变成透明的高墙\n[01:59.528]没能变成你\n[02:07.428]\n[02:39.996]我听过空境的回音\n[02:44.496]雨水浇绿孤山岭\n[02:48.746]听过被诅咒的秘密\n[02:52.490]没听过你\n[02:57.299]我抓住散落的欲望\n[03:01.649]缱绻的馥郁让我紧张\n[03:05.949]我抓住时间的假象\n[03:09.200]没抓住你\n[03:14.650]我包容六月清泉结冰\n[03:19.187]包容不老的生命\n[03:23.489]包容世界的迟疑\n[03:26.789]没包容你\n[03:32.139]我忘了置身濒绝孤岛\n[03:36.640]忘了眼泪不过失效药\n[03:40.990]忘了百年无声口号\n[03:44.490]没能忘记你\n[03:49.791]我想要更好更圆的月亮\n[03:53.742]想要未知的疯狂\n[03:58.592]想要声色的张扬\n[04:02.142]我想要你\n",
  "tlyric": ""
}
```

#### playlist

获取歌单，请求示例：[/music?server=netease&type=playlist&id=2305978163](/music?server=netease&type=playlist&id=2305978163)

> **注意**：id为歌单的id

返回结果：

```json
[
  {
    "id": 1442191755,
    "name": "ɪsᴏʟᴀᴛɪᴏɴ",
    "artist": [
      "Stevieboi"
    ],
    "album": "ɪsᴏʟᴀᴛɪᴏɴ",
    "pic_id": "109951164924535851",
    "url_id": 1442191755,
    "lyric_id": 1442191755,
    "source": "netease"
  },
  ...
]
```

#### search

搜索歌曲，请求示例：[/music?server=netease&type=search&id=陈粒&limit=5](/music?server=netease&type=search&id=陈粒&limit=5)

可以通过参数 `limit` 来设置搜索结果数量，默认为 `5`

> **注意**：id为需要搜索的参数

返回结果：

```json
[
    {
    "id": 30431366,
    "name": "奇妙能力歌",
    "artist": [ "陈粒" ],
    "album": "如也",
    "pic_id": "7721870161993398",
    "url_id": 30431366,
    "lyric_id": 30431366,
    "source": "netease"
    },
    { }, ...
]
```

Made with ❤️ by [Motues](https://www.motues.top)

如果使用过程中存在问题，欢迎通过[邮件](mailto:me@motues.top)告诉我
