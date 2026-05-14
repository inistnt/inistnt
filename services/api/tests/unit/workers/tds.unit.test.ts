// ═══════════════════════════════════════════════════════════
// UNIT TESTS — TDS Reporting Logic
// ═══════════════════════════════════════════════════════════

jest.mock('../../../src/infrastructure/database', () => require('../../mocks/database.mock'));

import { tdsRepo } from '../../../src/modules/workers/tds.routes';
import { db } from '../../mocks/database.mock';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tdsRepo.getWorkerPayoutTotals', () => {
  it('calculates TDS correctly for workers above threshold', async () => {
    const payouts = [
      { workerId: 'w1', amount: 2000000, worker: { id: 'w1', name: 'Worker 1' } }, // ₹20,000
      { workerId: 'w1', amount: 1500000, worker: { id: 'w1', name: 'Worker 1' } }, // ₹15,000 -> Total ₹35,000
      { workerId: 'w2', amount: 1000000, worker: { id: 'w2', name: 'Worker 2' } }, // ₹10,000
    ];

    (db.workerPayout.findMany as jest.Mock).mockResolvedValue(payouts);

    const result = await tdsRepo.getWorkerPayoutTotals('2025-26');

    expect(result.totalWorkers).toBe(2);
    expect(result.tdsApplicableCount).toBe(1); // Only w1
    // w1 TDS = 35,000 * 1% = ₹350 = 35000 paise
    const w1Record = result.records.find(r => r.worker.id === 'w1');
    expect(w1Record?.tdsApplicable).toBe(true);
    expect(w1Record?.tdsAmount).toBe(35000);
  });

  it('handles empty results gracefully', async () => {
    (db.workerPayout.findMany as jest.Mock).mockResolvedValue([]);
    const result = await tdsRepo.getWorkerPayoutTotals('2025-26');
    expect(result.totalWorkers).toBe(0);
    expect(result.totalPayoutsPaise).toBe(0);
  });
});

describe('tdsRepo.getFinanceSummary', () => {
  it('aggregates data correctly', async () => {
    (db.payment.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 1000000 } }); // GMV 10k
    (db.booking.aggregate as jest.Mock).mockResolvedValue({ _sum: { commissionAmount: 1200 } }); // Revenue 12
    (db.workerPayout.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 800000 } });
    (db.payment.aggregate as jest.Mock).mockResolvedValueOnce({ _sum: { amount: 50000 } }); // Refunds 500
    (db.workerSubscription.count as jest.Mock).mockResolvedValue(50);

    const result = await tdsRepo.getFinanceSummary('2025-01-01', '2025-03-31');

    expect(result.gmv.rupees).toBe(10000);
    expect(result.revenue.rupees).toBe(12);
    expect(result.activeSubscriptions).toBe(50);
  });
});
