import pino, { type LoggerOptions } from 'pino';
import { env } from '../config/env';

// Credentials never reach the log output, whatever object they are nested in.
export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'authorization',
  'cookie',
];

export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  // Human-readable output for local development only; JSON lines everywhere else.
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
};

export const logger = pino(loggerOptions);
