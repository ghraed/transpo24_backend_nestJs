CREATE TABLE "route_block_audits" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "routeBlockId" TEXT NOT NULL,
  "actorAdminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "route_block_audits_routeBlockId_fkey" FOREIGN KEY ("routeBlockId") REFERENCES "route_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "route_block_audits_routeBlockId_createdAt_idx" ON "route_block_audits"("routeBlockId", "createdAt");
