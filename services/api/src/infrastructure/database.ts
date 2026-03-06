import { PrismaClient } from '@prisma/client';
import { config } from '../config';

// Singleton — ek hi instance poori app mein
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      config.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (config.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

