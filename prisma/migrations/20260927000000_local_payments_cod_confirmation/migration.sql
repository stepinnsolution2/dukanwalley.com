-- Pakistani payment methods and cash-on-delivery confirmation.
ALTER TYPE "PaymentMethod" ADD VALUE 'JAZZCASH';
ALTER TYPE "PaymentMethod" ADD VALUE 'EASYPAISA';
ALTER TYPE "PaymentMethod" ADD VALUE 'CARD';
ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMED' AFTER 'PENDING_PAYMENT';

ALTER TABLE "Order" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "Order" ADD COLUMN "checkoutCartId" TEXT;
ALTER TABLE "Order" ADD COLUMN "confirmTokenHash" TEXT;
ALTER TABLE "Order" ADD COLUMN "confirmTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "confirmMessageSid" TEXT;
ALTER TABLE "Order" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "confirmedVia" TEXT;

CREATE UNIQUE INDEX "Order_confirmTokenHash_key" ON "Order"("confirmTokenHash");
CREATE UNIQUE INDEX "Order_confirmMessageSid_key" ON "Order"("confirmMessageSid");

-- Existing card orders were created by Stripe Checkout.
UPDATE "Order" SET "paymentProvider" = 'stripe' WHERE "paymentMethod" = 'STRIPE';
