import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  base: { service: 'kineticrouter-customer-portal' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'request.headers.authorization',
      'request.headers.cookie',
      'password',
      'oldPassword',
      'newPassword',
      'accessToken',
      'refreshToken',
      'tempToken',
      '*.key',
      '*.customKey',
    ],
    censor: '[REDACTED]',
  },
});
