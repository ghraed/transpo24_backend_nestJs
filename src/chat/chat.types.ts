import {
  ChatMessageSenderRole,
  ChatMessageType,
  ChatReportReason,
  ChatReportStatus,
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
  isBlockedByCurrentUser: boolean;
  isBlockedByOtherUser: boolean;
  canSendMessages: boolean;
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

export interface ChatBlockResponseDto {
  roomId: string;
  isBlockedByCurrentUser: boolean;
  isBlockedByOtherUser: boolean;
  canSendMessages: boolean;
}

export interface ChatReportResponseDto {
  id: string;
  roomId: string;
  messageId: string | null;
  reason: ChatReportReason;
  status: ChatReportStatus;
  createdAt: string;
}
