import pino from 'pino';
export const logger = pino({
  redact: [
    'apiKey',
    'password',
    'refreshToken',
    'authorization',
    '*.apiKey',
    '*.password',
    '*.prompt',
  ],
});
