import { Hono } from 'hono';
import { getAvatarData } from '../../controllers/avatarController.js';

const avatar = new Hono();

// 匹配根路径 /?xxx=...
avatar.get('/', getAvatarData);

export default avatar;