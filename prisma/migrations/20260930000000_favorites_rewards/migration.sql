-- Favourites and reward points.
ALTER TABLE "Order" ADD COLUMN "pointsRedeemed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "pointsDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Favorite_userId_productId_key" ON "Favorite"("userId", "productId");
CREATE UNIQUE INDEX "Favorite_sessionId_productId_key" ON "Favorite"("sessionId", "productId");
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RewardAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RewardAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RewardAccount_userId_market_key" ON "RewardAccount"("userId", "market");
ALTER TABLE "RewardAccount" ADD CONSTRAINT "RewardAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RewardEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RewardEntry_orderId_kind_key" ON "RewardEntry"("orderId", "kind");
CREATE INDEX "RewardEntry_accountId_createdAt_idx" ON "RewardEntry"("accountId", "createdAt");
ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "RewardAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
