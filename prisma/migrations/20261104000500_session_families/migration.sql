ALTER TABLE "refresh_sessions" ADD COLUMN "familyId" TEXT;
CREATE INDEX "refresh_sessions_familyId_revokedAt_idx" ON "refresh_sessions"("familyId","revokedAt");
