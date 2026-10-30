-- Nullable scope preserves every existing platform payment as legacy.
ALTER TABLE "payment_holds" ADD COLUMN "stripeAccountId" TEXT;
ALTER TABLE "additional_charges" ADD COLUMN "stripe_account_id" TEXT;
