import { Hono } from 'hono';
import { getEmojiData } from '../../controllers/emojiController.js';

const emoji = new Hono();

// OwO 格式表情数据：Twikoo / Artalk / Waline 中直接填写 https://<域名>/emoji/owo.json
emoji.get('/owo.json', getEmojiData);

// 别名，方便直接访问 /emoji（?group=分组名 可只取单个分组）
emoji.get('/', getEmojiData);

export default emoji;
