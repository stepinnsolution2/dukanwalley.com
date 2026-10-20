-- "You may also like" suggestions: event log plus indexes for the lookups behind them.
CREATE TYPE "RecommendationEventKind" AS ENUM ('SHOWN', 'CLICK', 'ADD');

CREATE TABLE "RecommendationEvent" (
    "id" TEXT NOT NULL,
    "kind" "RecommendationEventKind" NOT NULL,
    "productId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecommendationEvent_createdAt_idx" ON "RecommendationEvent"("createdAt");
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProductViewEvent_userId_createdAt_idx" ON "ProductViewEvent"("userId", "createdAt");
CREATE INDEX "ProductViewEvent_sessionId_createdAt_idx" ON "ProductViewEvent"("sessionId", "createdAt");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
