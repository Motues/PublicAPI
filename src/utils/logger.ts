const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

type LogLevel = keyof typeof LEVELS;

const configuredLevel = (process.env.LOG_LEVEL ?? 'info').trim().toLowerCase() as LogLevel;
const threshold = LEVELS[configuredLevel] ?? LEVELS.info;

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

const shouldLog = (level: LogLevel): boolean => LEVELS[level] >= threshold;

export const logger = {
  debug(message: string, tagLabel?: string) {
    if (shouldLog('debug')) {
      console.log(`${tag('DEBUG', tagLabel)} ${message}`);
    }
  },
  info(message: string, tagLabel?: string) {
    if (shouldLog('info')) {
      console.log(`${tag('INFO', tagLabel)} ${message}`);
    }
  },
  warn(message: string, tagLabel?: string) {
    if (shouldLog('warn')) {
      console.warn(`${tag('WARN', tagLabel)} ${message}`);
    }
  },
  error(message: string, err?: unknown, tagLabel?: string) {
    if (!shouldLog('error')) {
      return;
    }
    if (err !== undefined) {
      console.error(`${tag('ERROR', tagLabel)} ${message}`, err);
    } else {
      console.error(`${tag('ERROR', tagLabel)} ${message}`);
    }
  },
};
