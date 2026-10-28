-- AlterTable
ALTER TABLE "Product" ADD COLUMN "sourceDescription" TEXT,
ADD COLUMN "descriptionWrittenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN "writeDescriptions" BOOLEAN NOT NULL DEFAULT false;
