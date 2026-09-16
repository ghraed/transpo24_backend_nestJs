-- Unknown legacy tokens stay unclassified and cannot receive scoped pushes.
ALTER TABLE "push_tokens" ADD COLUMN "environment" TEXT,
ADD COLUMN "applicationId" TEXT;
CREATE INDEX "push_tokens_environment_applicationId_isActive_idx"
ON "push_tokens"("environment", "applicationId", "isActive");
