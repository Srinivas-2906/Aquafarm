-- CreateTable
CREATE TABLE "PinResetRequest" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinResetRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PinResetRequest_status_createdAt_idx" ON "PinResetRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PinResetRequest_phoneNumber_idx" ON "PinResetRequest"("phoneNumber");
