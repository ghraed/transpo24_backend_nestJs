CREATE TYPE "ChatRoomStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE "ChatMessageSenderRole" AS ENUM ('CLIENT', 'DRIVER');
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'SYSTEM');

CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL,
    "transportRequestId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "acceptedOfferId" TEXT NOT NULL,
    "status" "ChatRoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "ChatMessageSenderRole" NOT NULL,
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_rooms_transportRequestId_key" ON "chat_rooms"("transportRequestId");
CREATE UNIQUE INDEX "chat_rooms_acceptedOfferId_key" ON "chat_rooms"("acceptedOfferId");
CREATE INDEX "chat_rooms_transportRequestId_idx" ON "chat_rooms"("transportRequestId");
CREATE INDEX "chat_rooms_clientId_idx" ON "chat_rooms"("clientId");
CREATE INDEX "chat_rooms_driverId_idx" ON "chat_rooms"("driverId");
CREATE INDEX "chat_rooms_createdAt_idx" ON "chat_rooms"("createdAt");
CREATE INDEX "chat_messages_chatRoomId_idx" ON "chat_messages"("chatRoomId");
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");

ALTER TABLE "chat_rooms"
ADD CONSTRAINT "chat_rooms_transportRequestId_fkey"
FOREIGN KEY ("transportRequestId") REFERENCES "transport_requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_rooms"
ADD CONSTRAINT "chat_rooms_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_rooms"
ADD CONSTRAINT "chat_rooms_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_rooms"
ADD CONSTRAINT "chat_rooms_acceptedOfferId_fkey"
FOREIGN KEY ("acceptedOfferId") REFERENCES "driver_offers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_messages"
ADD CONSTRAINT "chat_messages_chatRoomId_fkey"
FOREIGN KEY ("chatRoomId") REFERENCES "chat_rooms"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
