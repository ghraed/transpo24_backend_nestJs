CREATE TABLE "legal_acceptances" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "version" TEXT NOT NULL,
 "documentHash" TEXT NOT NULL, "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "method" TEXT NOT NULL, CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legal_acceptances_userId_version_key" ON "legal_acceptances"("userId","version");
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
