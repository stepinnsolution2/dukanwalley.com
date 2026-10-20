-- Card orders wait in PENDING_PAYMENT until the Stripe webhook confirms payment.
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_PAYMENT' AFTER 'PLACED';
