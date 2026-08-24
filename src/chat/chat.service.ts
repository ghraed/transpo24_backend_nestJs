import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatMessageSenderRole,
  ChatMessageType,
  ChatReportReason,
  ChatRoomStatus,
  Prisma,
  PushApp,
  UserRole,
} from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChatBlockResponseDto,
  ChatMessageReadResponseDto,
  ChatMessageResponseDto,
  ChatReportResponseDto,
  ChatRoomMessagesResponseDto,
  ChatRoomSummaryDto,
} from './chat.types';

type RoomAccessRecord = {
  id: string;
  transportRequestId: string;
  clientId: string;
  driverId: string;
  acceptedOfferId: string;
  status: ChatRoomStatus;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  acceptedOffer: {
    id: string;
    driverId: string;
  } | null;
  driver: {
    id: string;
    userId: string;
  };
  messages: Array<{
    id: string;
    chatRoomId: string;
    senderId: string;
    senderRole: ChatMessageSenderRole;
    type: ChatMessageType;
    body: string | null;
    attachmentUrl: string | null;
    createdAt: Date;
    readAt: Date | null;
  }>;
};

type ChatActorContext = {
  user: AuthenticatedUser;
  driverProfileId: string | null;
};

type ChatAccessContext = {
  actor: ChatActorContext;
  room: RoomAccessRecord;
  senderId: string;
  senderRole: ChatMessageSenderRole;
  recipientUserId: string;
  recipientApp: PushApp;
};

const ROOM_ACCESS_SELECT = {
  id: true,
  transportRequestId: true,
  clientId: true,
  driverId: true,
  acceptedOfferId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
  acceptedOffer: {
    select: {
      id: true,
      driverId: true,
    },
  },
  driver: {
    select: {
      id: true,
      userId: true,
    },
  },
  messages: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 1,
    select: {
      id: true,
      chatRoomId: true,
      senderId: true,
      senderRole: true,
      type: true,
      body: true,
      attachmentUrl: true,
      createdAt: true,
      readAt: true,
    },
  },
} satisfies Prisma.ChatRoomSelect;

type RoomAccessSelect = Prisma.ChatRoomGetPayload<{
  select: typeof ROOM_ACCESS_SELECT;
}>;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async ensureRoomForAcceptedOffer(
    tx: Prisma.TransactionClient,
    input: {
      transportRequestId: string;
      clientId: string;
      driverId: string;
      acceptedOfferId: string;
    },
  ): Promise<{ id: string }> {
    return tx.chatRoom.upsert({
      where: {
        transportRequestId: input.transportRequestId,
      },
      update: {
        clientId: input.clientId,
        driverId: input.driverId,
        acceptedOfferId: input.acceptedOfferId,
        status: ChatRoomStatus.ACTIVE,
        closedAt: null,
      },
      create: {
        transportRequestId: input.transportRequestId,
        clientId: input.clientId,
        driverId: input.driverId,
        acceptedOfferId: input.acceptedOfferId,
        status: ChatRoomStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });
  }

  async listRooms(user: AuthenticatedUser): Promise<ChatRoomSummaryDto[]> {
    const actor = await this.resolveActor(user);
    const rooms = await this.prisma.chatRoom.findMany({
      where:
        actor.driverProfileId === null
          ? {
              clientId: user.id,
            }
          : {
              OR: [{ clientId: user.id }, { driverId: actor.driverProfileId }],
            },
      orderBy: {
        updatedAt: 'desc',
      },
      select: ROOM_ACCESS_SELECT,
    });

    return Promise.all(
      rooms.map((room) =>
        this.toChatRoomSummary(room, user.id, actor.driverProfileId),
      ),
    );
  }

  async getRoomByTransportRequest(
    user: AuthenticatedUser,
    transportRequestId: string,
  ): Promise<ChatRoomSummaryDto> {
    const access = await this.getAccessContextByRequest(
      user,
      transportRequestId,
    );
    return this.toChatRoomSummary(
      access.room,
      user.id,
      access.actor.driverProfileId,
    );
  }

  async getRoomMessages(input: {
    user: AuthenticatedUser;
    roomId: string;
    page?: number;
    limit?: number;
  }): Promise<ChatRoomMessagesResponseDto> {
    const access = await this.getAccessContextByRoom(input.user, input.roomId);
    const page = this.normalizePage(input.page ?? 1);
    const limit = this.normalizeLimit(input.limit ?? 20);

    const [messages, total] = await this.prisma.$transaction([
      this.prisma.chatMessage.findMany({
        where: {
          chatRoomId: access.room.id,
        },
        orderBy: {
          createdAt: 'asc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatMessage.count({
        where: {
          chatRoomId: access.room.id,
        },
      }),
    ]);

    return {
      room: await this.toChatRoomSummary(
        access.room,
        input.user.id,
        access.actor.driverProfileId,
      ),
      messages: messages.map((message) => this.toChatMessageResponse(message)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async sendTextMessage(input: {
    user: AuthenticatedUser;
    roomId: string;
    body: string;
  }): Promise<ChatMessageResponseDto> {
    const access = await this.getAccessContextByRoom(input.user, input.roomId);
    const normalizedBody = input.body.trim();

    if (!normalizedBody) {
      throw new BadRequestException('Message body is required.');
    }

    if (access.room.status !== ChatRoomStatus.ACTIVE) {
      throw new BadRequestException(
        'This chat room is closed for new messages.',
      );
    }

    await this.assertMessagingNotBlocked(access);

    const created = await this.prisma.chatMessage.create({
      data: {
        chatRoomId: access.room.id,
        senderId: access.senderId,
        senderRole: access.senderRole,
        type: ChatMessageType.TEXT,
        body: normalizedBody,
      },
    });

    await this.prisma.chatRoom.update({
      where: {
        id: access.room.id,
      },
      data: {
        updatedAt: created.createdAt,
      },
    });

    void this.notificationsService
      .notifyChatMessage({
        recipientUserId: access.recipientUserId,
        recipientApp: access.recipientApp,
        chatRoomId: access.room.id,
        transportRequestId: access.room.transportRequestId,
        body: normalizedBody,
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to send chat notification for room ${access.room.id}: ${error instanceof Error ? error.message : 'Unexpected error'}`,
        );
      });

    return this.toChatMessageResponse(created);
  }

  async markRoomAsRead(input: {
    user: AuthenticatedUser;
    roomId: string;
  }): Promise<ChatMessageReadResponseDto> {
    const access = await this.getAccessContextByRoom(input.user, input.roomId);
    const readAt = new Date();

    const updated = await this.prisma.chatMessage.updateMany({
      where: {
        chatRoomId: access.room.id,
        senderRole:
          access.senderRole === ChatMessageSenderRole.CLIENT
            ? ChatMessageSenderRole.DRIVER
            : ChatMessageSenderRole.CLIENT,
        readAt: null,
      },
      data: {
        readAt,
      },
    });

    return {
      roomId: access.room.id,
      readCount: updated.count,
      readAt: readAt.toISOString(),
    };
  }

  async createReport(input: {
    user: AuthenticatedUser;
    roomId: string;
    messageId?: string;
    reason: ChatReportReason;
    details?: string;
  }): Promise<ChatReportResponseDto> {
    const access = await this.getAccessContextByRoom(input.user, input.roomId);
    const messageId = input.messageId?.trim() || null;
    const details = input.details?.trim() || null;

    if (input.reason === ChatReportReason.OTHER && !details) {
      throw new BadRequestException(
        'Please add details when selecting the other report reason.',
      );
    }

    if (messageId) {
      const reportedMessage = await this.prisma.chatMessage.findFirst({
        where: {
          id: messageId,
          chatRoomId: access.room.id,
          senderRole:
            access.senderRole === ChatMessageSenderRole.CLIENT
              ? ChatMessageSenderRole.DRIVER
              : ChatMessageSenderRole.CLIENT,
        },
        select: { id: true },
      });

      if (!reportedMessage) {
        throw new BadRequestException(
          'The selected message cannot be reported from this chat.',
        );
      }
    }

    const report = await this.prisma.chatReport.create({
      data: {
        chatRoomId: access.room.id,
        messageId,
        reporterUserId: access.actor.user.id,
        reportedUserId: access.recipientUserId,
        reason: input.reason,
        details,
      },
      select: {
        id: true,
        chatRoomId: true,
        messageId: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      id: report.id,
      roomId: report.chatRoomId,
      messageId: report.messageId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
    };
  }

  async blockParticipant(input: {
    user: AuthenticatedUser;
    roomId: string;
  }): Promise<ChatBlockResponseDto> {
    const access = await this.getAccessContextByRoom(input.user, input.roomId);

    await this.prisma.chatBlock.upsert({
      where: {
        chatRoomId_blockerUserId_blockedUserId: {
          chatRoomId: access.room.id,
          blockerUserId: access.actor.user.id,
          blockedUserId: access.recipientUserId,
        },
      },
      update: {},
      create: {
        chatRoomId: access.room.id,
        blockerUserId: access.actor.user.id,
        blockedUserId: access.recipientUserId,
      },
    });

    return this.getBlockState(access);
  }

  async unblockParticipant(input: {
    user: AuthenticatedUser;
    roomId: string;
  }): Promise<ChatBlockResponseDto> {
    const access = await this.getAccessContextByRoom(input.user, input.roomId);

    await this.prisma.chatBlock.deleteMany({
      where: {
        chatRoomId: access.room.id,
        blockerUserId: access.actor.user.id,
        blockedUserId: access.recipientUserId,
      },
    });

    return this.getBlockState(access);
  }

  async assertCanAccessRoom(input: {
    user: AuthenticatedUser;
    roomId: string;
  }): Promise<void> {
    await this.getAccessContextByRoom(input.user, input.roomId);
  }

  private async getAccessContextByRequest(
    user: AuthenticatedUser,
    transportRequestId: string,
  ): Promise<ChatAccessContext> {
    const normalizedRequestId = transportRequestId.trim();
    if (!normalizedRequestId) {
      throw new BadRequestException('transportRequestId is required.');
    }

    const room = await this.prisma.chatRoom.findUnique({
      where: {
        transportRequestId: normalizedRequestId,
      },
      select: ROOM_ACCESS_SELECT,
    });

    if (!room) {
      throw new NotFoundException('Chat room not found.');
    }

    return this.buildAccessContext(user, room);
  }

  private async getAccessContextByRoom(
    user: AuthenticatedUser,
    roomId: string,
  ): Promise<ChatAccessContext> {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) {
      throw new BadRequestException('roomId is required.');
    }

    const room = await this.prisma.chatRoom.findUnique({
      where: {
        id: normalizedRoomId,
      },
      select: ROOM_ACCESS_SELECT,
    });

    if (!room) {
      throw new NotFoundException('Chat room not found.');
    }

    return this.buildAccessContext(user, room);
  }

  private async buildAccessContext(
    user: AuthenticatedUser,
    room: RoomAccessSelect,
  ): Promise<ChatAccessContext> {
    const actor = await this.resolveActor(user);

    if (room.clientId === user.id) {
      return {
        actor,
        room,
        senderId: user.id,
        senderRole: ChatMessageSenderRole.CLIENT,
        recipientUserId: room.driver.userId,
        recipientApp: PushApp.DRIVER,
      };
    }

    if (
      actor.driverProfileId &&
      room.driverId === actor.driverProfileId &&
      room.acceptedOffer?.driverId === actor.driverProfileId
    ) {
      return {
        actor,
        room,
        senderId: actor.driverProfileId,
        senderRole: ChatMessageSenderRole.DRIVER,
        recipientUserId: room.clientId,
        recipientApp: PushApp.CUSTOMER,
      };
    }

    throw new ForbiddenException(
      'You are not allowed to access this chat room.',
    );
  }

  private async assertMessagingNotBlocked(
    access: ChatAccessContext,
  ): Promise<void> {
    const block = await this.prisma.chatBlock.findFirst({
      where: {
        chatRoomId: access.room.id,
        OR: [
          {
            blockerUserId: access.actor.user.id,
            blockedUserId: access.recipientUserId,
          },
          {
            blockerUserId: access.recipientUserId,
            blockedUserId: access.actor.user.id,
          },
        ],
      },
      select: { blockerUserId: true },
    });

    if (block) {
      throw new ForbiddenException(
        block.blockerUserId === access.actor.user.id
          ? 'Unblock this participant before sending a message.'
          : 'Messaging is unavailable for this conversation.',
      );
    }
  }

  private async getBlockState(
    access: ChatAccessContext,
  ): Promise<ChatBlockResponseDto> {
    return this.getBlockStateForParticipants({
      roomId: access.room.id,
      roomStatus: access.room.status,
      currentUserId: access.actor.user.id,
      otherUserId: access.recipientUserId,
    });
  }

  private async getBlockStateForParticipants(input: {
    roomId: string;
    roomStatus: ChatRoomStatus;
    currentUserId: string;
    otherUserId: string;
  }): Promise<ChatBlockResponseDto> {
    const blocks = await this.prisma.chatBlock.findMany({
      where: { chatRoomId: input.roomId },
      select: {
        blockerUserId: true,
        blockedUserId: true,
      },
    });
    const isBlockedByCurrentUser = blocks.some(
      (block) =>
        block.blockerUserId === input.currentUserId &&
        block.blockedUserId === input.otherUserId,
    );
    const isBlockedByOtherUser = blocks.some(
      (block) =>
        block.blockerUserId === input.otherUserId &&
        block.blockedUserId === input.currentUserId,
    );

    return {
      roomId: input.roomId,
      isBlockedByCurrentUser,
      isBlockedByOtherUser,
      canSendMessages:
        input.roomStatus === ChatRoomStatus.ACTIVE &&
        !isBlockedByCurrentUser &&
        !isBlockedByOtherUser,
    };
  }

  private async resolveActor(
    user: AuthenticatedUser,
  ): Promise<ChatActorContext> {
    if (user.role !== UserRole.DRIVER) {
      return {
        user,
        driverProfileId: null,
      };
    }

    const profile = await this.prisma.driverProfile.findUnique({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    return {
      user,
      driverProfileId: profile?.id ?? null,
    };
  }

  private async toChatRoomSummary(
    room: RoomAccessRecord,
    userId: string,
    driverProfileId: string | null,
  ): Promise<ChatRoomSummaryDto> {
    const currentRole =
      room.clientId === userId
        ? ChatMessageSenderRole.CLIENT
        : driverProfileId === room.driverId
          ? ChatMessageSenderRole.DRIVER
          : ChatMessageSenderRole.CLIENT;

    const unreadCount = await this.prisma.chatMessage.count({
      where: {
        chatRoomId: room.id,
        readAt: null,
        senderRole:
          currentRole === ChatMessageSenderRole.CLIENT
            ? ChatMessageSenderRole.DRIVER
            : ChatMessageSenderRole.CLIENT,
      },
    });
    const currentUserId =
      currentRole === ChatMessageSenderRole.CLIENT
        ? room.clientId
        : room.driver.userId;
    const otherUserId =
      currentRole === ChatMessageSenderRole.CLIENT
        ? room.driver.userId
        : room.clientId;
    const blockState = await this.getBlockStateForParticipants({
      roomId: room.id,
      roomStatus: room.status,
      currentUserId,
      otherUserId,
    });

    return {
      id: room.id,
      transportRequestId: room.transportRequestId,
      clientId: room.clientId,
      driverId: room.driverId,
      acceptedOfferId: room.acceptedOfferId,
      status: room.status,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      lastMessage: room.messages[0]
        ? this.toChatMessageResponse(room.messages[0])
        : null,
      unreadCount,
      isBlockedByCurrentUser: blockState.isBlockedByCurrentUser,
      isBlockedByOtherUser: blockState.isBlockedByOtherUser,
      canSendMessages: blockState.canSendMessages,
    };
  }

  private toChatMessageResponse(message: {
    id: string;
    chatRoomId: string;
    senderId: string;
    senderRole: ChatMessageSenderRole;
    type: ChatMessageType;
    body: string | null;
    attachmentUrl: string | null;
    createdAt: Date;
    readAt: Date | null;
  }): ChatMessageResponseDto {
    return {
      id: message.id,
      chatRoomId: message.chatRoomId,
      senderId: message.senderId,
      senderRole: message.senderRole,
      type: message.type,
      body: message.body,
      attachmentUrl: message.attachmentUrl,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt?.toISOString() ?? null,
    };
  }

  private normalizePage(page: number): number {
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer.');
    }

    return page;
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100.');
    }

    return limit;
  }
}
