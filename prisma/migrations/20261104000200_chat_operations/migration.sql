ALTER TABLE "chat_messages" ADD COLUMN "operationId" TEXT, ADD COLUMN "operationHash" TEXT;
CREATE UNIQUE INDEX "chat_messages_chatRoomId_senderId_operationId_key" ON "chat_messages"("chatRoomId","senderId","operationId");
