-- Home hero banners and paid advertising (Admin › Banners, Admin › Advertising).
CREATE TABLE "HeroBanner" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HeroBanner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Advertiser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Advertiser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdBanner" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "linkUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "price" INTEGER,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdBanner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdStat" (
    "id" TEXT NOT NULL,
    "adBannerId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AdStat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdBanner_placement_startsAt_endsAt_idx" ON "AdBanner"("placement", "startsAt", "endsAt");
CREATE UNIQUE INDEX "AdStat_adBannerId_day_key" ON "AdStat"("adBannerId", "day");

ALTER TABLE "AdBanner" ADD CONSTRAINT "AdBanner_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdStat" ADD CONSTRAINT "AdStat_adBannerId_fkey" FOREIGN KEY ("adBannerId") REFERENCES "AdBanner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
