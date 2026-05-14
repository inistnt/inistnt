-- CreateTable
CREATE TABLE "call_sessions" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "callType" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "initiatorType" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "receiverType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RINGING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "endedBy" TEXT,
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_sessions_bookingId_idx" ON "call_sessions"("bookingId");

-- CreateIndex
CREATE INDEX "call_sessions_initiatorId_idx" ON "call_sessions"("initiatorId");

-- CreateIndex
CREATE INDEX "call_sessions_receiverId_idx" ON "call_sessions"("receiverId");

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
