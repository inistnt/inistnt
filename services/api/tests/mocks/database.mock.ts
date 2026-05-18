// ═══════════════════════════════════════════════════════════
// DATABASE MOCK — Prisma client mock for unit/e2e tests
// Every model method is a jest.fn() — override per test
// ═══════════════════════════════════════════════════════════

const createModelMock = () => ({
  findUnique:   jest.fn(),
  findFirst:    jest.fn(),
  findMany:     jest.fn(),
  create:       jest.fn(),
  update:       jest.fn(),
  updateMany:   jest.fn(),
  upsert:       jest.fn(),
  delete:       jest.fn(),
  deleteMany:   jest.fn(),
  count:        jest.fn(),
  aggregate:    jest.fn(),
  groupBy:      jest.fn(),
});

export const db = {
  // Auth models
  otpStore:       createModelMock(),
  user:           createModelMock(),
  userSession:    createModelMock(),
  worker:         createModelMock(),
  workerSession:  createModelMock(),
  staff:          createModelMock(),
  staffSession:   createModelMock(),

  // Core models
  service:        createModelMock(),
  servicePricing: createModelMock(),
  serviceCategory: createModelMock(),
  city:           createModelMock(),
  area:           createModelMock(),
  address:        createModelMock(),
  booking:        createModelMock(),
  bookingStatusHistory: createModelMock(),
  review:         createModelMock(),
  payment:        createModelMock(),
  workerEarning:  createModelMock(),
  payout:         createModelMock(),
  workerPayout:   createModelMock(),

  // Finance models
  coupon:         createModelMock(),
  commissionRule: createModelMock(),
  wallet:         createModelMock(),
  walletTransaction: createModelMock(),
  workerLoan:     createModelMock(),
  tdsRecord:      createModelMock(),

  // Admin / config models
  campaign:       createModelMock(),
  appVersion:     createModelMock(),
  featureFlag:    createModelMock(),
  notification:   createModelMock(),
  supportTicket:  createModelMock(),
  chatMessage:    createModelMock(),
  auditLog:       createModelMock(),
  subscription:   createModelMock(),
  workerSubscription: createModelMock(),
  trainingModule: createModelMock(),

  // Prisma methods
  $connect:    jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $queryRaw:   jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  $executeRaw: jest.fn().mockResolvedValue(1),
  $transaction: jest.fn().mockImplementation(async (cb: Function) => cb(db)),
};

/** Reset all mock functions between tests */
export function resetDbMocks() {
  const resetModel = (model: ReturnType<typeof createModelMock>) => {
    Object.values(model).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as jest.Mock).mockReset();
      }
    });
  };

  Object.values(db).forEach((value) => {
    if (value && typeof value === 'object' && 'findUnique' in value) {
      resetModel(value as ReturnType<typeof createModelMock>);
    }
  });

  (db.$connect as jest.Mock).mockResolvedValue(undefined);
  (db.$disconnect as jest.Mock).mockResolvedValue(undefined);
  (db.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
  (db.$transaction as jest.Mock).mockImplementation(async (cb: Function) => cb(db));
}
