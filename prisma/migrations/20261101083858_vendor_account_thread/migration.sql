-- AlterTable
ALTER TABLE "VendorProfile" ADD COLUMN     "accountSeenByAdminAt" TIMESTAMP(3),
ADD COLUMN     "accountSeenByVendorAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VendorAccountEntry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2),
    "method" TEXT,
    "reference" TEXT,
    "paidOn" TIMESTAMP(3),
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "confirmedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorAccountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorAccountEntry_vendorId_createdAt_idx" ON "VendorAccountEntry"("vendorId", "createdAt");

-- AddForeignKey
ALTER TABLE "VendorAccountEntry" ADD CONSTRAINT "VendorAccountEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
