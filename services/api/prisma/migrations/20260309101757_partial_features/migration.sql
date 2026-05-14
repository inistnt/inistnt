-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "bookedHours" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "loyaltyPointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "platformFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralRewarded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "disputes" ALTER COLUMN "raisedBy" SET DEFAULT 'USER';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fcmToken" TEXT;

-- AlterTable
ALTER TABLE "worker_earnings" ALTER COLUMN "finalAmount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "monthlyPayoutCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payoutCountResetAt" TIMESTAMP(3);
