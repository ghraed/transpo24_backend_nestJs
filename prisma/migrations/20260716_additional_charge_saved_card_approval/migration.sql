ALTER TABLE "additional_charges"
ADD COLUMN "approval_in_flight_at" TIMESTAMP(3),
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "approved_by_customer_id" TEXT,
ADD COLUMN "approval_locale" TEXT,
ADD COLUMN "approval_confirmation_text" TEXT,
ADD COLUMN "stripe_payment_intent_id" TEXT,
ADD COLUMN "stripe_charge_id" TEXT,
ADD COLUMN "saved_payment_method_id" TEXT,
ADD COLUMN "saved_payment_method_brand" TEXT,
ADD COLUMN "saved_payment_method_last4" TEXT,
ADD COLUMN "payment_failure_reason" TEXT;

CREATE UNIQUE INDEX "additional_charges_stripe_payment_intent_id_key"
ON "additional_charges"("stripe_payment_intent_id");

CREATE INDEX "additional_charges_stripe_payment_intent_id_idx"
ON "additional_charges"("stripe_payment_intent_id");
