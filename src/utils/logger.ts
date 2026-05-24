const timestamp = (): string => {
  const now = new Date();
  return now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-');
};

const tag = (level: string, tag?: string): string => {
  const base = `[${timestamp()}] [${level}]`;
  return tag ? `${base} [${tag}]` : base;
};

export const logger = {
  info(message: string, tagLabel?: string) {
    console.log(`${tag('INFO', tagLabel)} ${message}`);
  },
  warn(message: string, tagLabel?: string) {
    console.warn(`${tag('WARN', tagLabel)} ${message}`);
  },
  error(message: string, err?: unknown, tagLabel?: string) {
    if (err !== undefined) {
      console.error(`${tag('ERROR', tagLabel)} ${message}`, err);
    } else {
      console.error(`${tag('ERROR', tagLabel)} ${message}`);
    }
  },
};
