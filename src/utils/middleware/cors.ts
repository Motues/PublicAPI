import { cors } from 'hono/cors';

export const createCorsMiddleware = (allowedOrigins: string[]) => {
  return cors({
    origin: (origin) => {
      if (!allowedOrigins || allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
        return origin;
      }
      return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Retry-After'],
    maxAge: 86400,
    credentials: true,
  });
};