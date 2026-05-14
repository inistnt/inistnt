import cron from 'node-cron';
import { retryFailedPayouts } from '../../modules/payout/cashfree-payout.service';

export function startPayoutRetryCron() {
  // Every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      await retryFailedPayouts();
    } catch (err) {
      console.error('[PayoutRetryCron] Unhandled error:', err);
    }
  });
  console.log('✅ Payout retry cron scheduled (every 30 minutes)');
}
