-- Customer phone authentication is additive: existing email/password data is preserved.
-- The nullable phone column can be introduced safely without inventing phone data or
-- deleting/merging existing users. PostgreSQL permits multiple NULLs in a unique index.
ALTER TABLE "User"
ADD COLUMN "phoneNumber" TEXT,
ADD COLUMN "isProfileCompleted" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refresh_sessions_tokenHash_key" ON "refresh_sessions"("tokenHash");
CREATE INDEX "refresh_sessions_userId_revokedAt_idx" ON "refresh_sessions"("userId", "revokedAt");
CREATE INDEX "refresh_sessions_expiresAt_idx" ON "refresh_sessions"("expiresAt");
