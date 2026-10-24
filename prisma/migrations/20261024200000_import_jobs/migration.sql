-- Supplier file imports from Admin › Products › Import.
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preview',
    "vendorId" TEXT NOT NULL,
    "stockPerItem" INTEGER NOT NULL,
    "createdById" TEXT,
    "products" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "results" JSONB,
    "total" INTEGER NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");
