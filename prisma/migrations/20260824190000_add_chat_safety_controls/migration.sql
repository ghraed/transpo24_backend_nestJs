CREATE TYPE "ChatReportReason" AS ENUM (
  'HARASSMENT',
  'HATE_SPEECH',
  'SEXUAL_CONTENT',
  'THREATS_OR_VIOLENCE',
  'SPAM_OR_SCAM',
  'PERSONAL_INFORMATION',
  'OTHER'
);

CREATE TYPE "ChatReportStatus" AS ENUM (
  'PENDING',
  'REVIEWED',
  'ACTIONED',
  'DISMISSED'
);

CREATE TABLE "chat_blocks" (
  "id" TEXT NOT NULL,
  "chatRoomId" TEXT NOT NULL,
  "blockerUserId" TEXT NOT NULL,
  "blockedUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_reports" (
  "id" TEXT NOT NULL,
  "chatRoomId" TEXT NOT NULL,
  "messageId" TEXT,
  "reporterUserId" TEXT NOT NULL,
  "reportedUserId" TEXT NOT NULL,
  "reason" "ChatReportReason" NOT NULL,
  "details" TEXT,
  "status" "ChatReportStatus" NOT NULL DEFAULT 'PENDING',
  "resolutionNote" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_blocks_chatRoomId_blockerUserId_blockedUserId_key"
ON "chat_blocks"("chatRoomId", "blockerUserId", "blockedUserId");
CREATE INDEX "chat_blocks_blockerUserId_createdAt_idx" ON "chat_blocks"("blockerUserId", "createdAt");
CREATE INDEX "chat_blocks_blockedUserId_createdAt_idx" ON "chat_blocks"("blockedUserId", "createdAt");

CREATE INDEX "chat_reports_status_createdAt_idx" ON "chat_reports"("status", "createdAt");
CREATE INDEX "chat_reports_chatRoomId_createdAt_idx" ON "chat_reports"("chatRoomId", "createdAt");
CREATE INDEX "chat_reports_reporterUserId_createdAt_idx" ON "chat_reports"("reporterUserId", "createdAt");
CREATE INDEX "chat_reports_reportedUserId_createdAt_idx" ON "chat_reports"("reportedUserId", "createdAt");
CREATE INDEX "chat_reports_messageId_idx" ON "chat_reports"("messageId");

ALTER TABLE "chat_blocks"
ADD CONSTRAINT "chat_blocks_chatRoomId_fkey"
FOREIGN KEY ("chatRoomId") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_blocks"
ADD CONSTRAINT "chat_blocks_blockerUserId_fkey"
FOREIGN KEY ("blockerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_blocks"
ADD CONSTRAINT "chat_blocks_blockedUserId_fkey"
FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_reports"
ADD CONSTRAINT "chat_reports_chatRoomId_fkey"
FOREIGN KEY ("chatRoomId") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reports"
ADD CONSTRAINT "chat_reports_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_reports"
ADD CONSTRAINT "chat_reports_reporterUserId_fkey"
FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reports"
ADD CONSTRAINT "chat_reports_reportedUserId_fkey"
FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
