import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.LOG_LEVEL ?? 'info',
  ...(config.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  }),
});
