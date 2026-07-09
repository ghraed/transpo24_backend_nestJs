import {
  ChatMessageSenderRole,
  ChatMessageType,
  ChatRoomStatus,
} from '@prisma/client';

export interface ChatMessageResponseDto {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderRole: ChatMessageSenderRole;
  type: ChatMessageType;
  body: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface ChatRoomSummaryDto {
  id: string;
  transportRequestId: string;
  clientId: string;
  driverId: string;
  acceptedOfferId: string;
  status: ChatRoomStatus;
  createdAt: string;
  updatedAt: string;
  lastMessage: ChatMessageResponseDto | null;
  unreadCount: number;
}

export interface ChatRoomMessagesResponseDto {
  room: ChatRoomSummaryDto;
  messages: ChatMessageResponseDto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ChatMessageReadResponseDto {
  roomId: string;
  readCount: number;
  readAt: string;
}
