import { startConsumer, stopConsumer } from './kafka/consumer';
import { closeDb }   from './providers/db';
import { logger }    from './logger';

async function main() {
  logger.info('🔔 Notification Service starting...');

  await startConsumer();

  logger.info('✅ Notification Service ready — listening for events');
  logger.info('   Channels: FCM Push | MSG91 SMS | Email (SMTP/Mailhog)');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await stopConsumer();
    await closeDb();
    logger.info('👋 Notification Service shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  logger.fatal({ err }, '❌ Fatal startup error');
  process.exit(1);
});
