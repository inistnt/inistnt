-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FraudFlagType" ADD VALUE 'RAPID_CANCELLATIONS';
ALTER TYPE "FraudFlagType" ADD VALUE 'LOCATION_SPOOFING';
ALTER TYPE "FraudFlagType" ADD VALUE 'FAKE_REVIEW';
ALTER TYPE "FraudFlagType" ADD VALUE 'COD_FRAUD';
ALTER TYPE "FraudFlagType" ADD VALUE 'SUSPICIOUS_BOOKING_PATTERN';
ALTER TYPE "FraudFlagType" ADD VALUE 'IDENTITY_FRAUD';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "reminderSent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "aiTags" TEXT[],
ADD COLUMN     "helpfulCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isSuspicious" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerRespondedAt" TIMESTAMP(3),
ADD COLUMN     "ownerResponse" TEXT,
ADD COLUMN     "sentimentLabel" TEXT,
ADD COLUMN     "sentimentScore" DOUBLE PRECISION,
ADD COLUMN     "suspicionReason" TEXT;

-- AlterTable
ALTER TABLE "worker_payouts" ADD COLUMN     "cashfreeBeneId" TEXT,
ADD COLUMN     "cashfreeTransferId" TEXT,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "payoutMethod" SET DEFAULT 'upi';

-- CreateTable
CREATE TABLE "worker_live_locations" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "bearing" DOUBLE PRECISION,
    "bookingId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_live_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usages" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_courses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'beginner',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "thumbnailUrl" TEXT,
    "totalLessons" INTEGER NOT NULL DEFAULT 0,
    "estimatedMins" INTEGER NOT NULL DEFAULT 0,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_lessons" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isQuiz" BOOLEAN NOT NULL DEFAULT false,
    "quizData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_training_enrollments" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enrolled',
    "completedLessons" INTEGER[],
    "lastLessonId" TEXT,
    "quizScore" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_training_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_certificates" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "pdfUrl" TEXT,

    CONSTRAINT "worker_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_live_locations_workerId_key" ON "worker_live_locations"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_usages_bookingId_key" ON "coupon_usages"("bookingId");

-- CreateIndex
CREATE INDEX "coupon_usages_couponId_idx" ON "coupon_usages"("couponId");

-- CreateIndex
CREATE INDEX "coupon_usages_userId_idx" ON "coupon_usages"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_usages_couponId_userId_bookingId_key" ON "coupon_usages"("couponId", "userId", "bookingId");

-- CreateIndex
CREATE INDEX "training_lessons_courseId_order_idx" ON "training_lessons"("courseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "worker_training_enrollments_workerId_courseId_key" ON "worker_training_enrollments"("workerId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_certificates_enrollmentId_key" ON "worker_certificates"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_certificates_certificateNo_key" ON "worker_certificates"("certificateNo");

-- CreateIndex
CREATE INDEX "worker_certificates_workerId_idx" ON "worker_certificates"("workerId");

-- AddForeignKey
ALTER TABLE "worker_live_locations" ADD CONSTRAINT "worker_live_locations_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_lessons" ADD CONSTRAINT "training_lessons_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_training_enrollments" ADD CONSTRAINT "worker_training_enrollments_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_training_enrollments" ADD CONSTRAINT "worker_training_enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_certificates" ADD CONSTRAINT "worker_certificates_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_certificates" ADD CONSTRAINT "worker_certificates_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "worker_training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
