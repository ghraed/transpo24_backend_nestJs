import {
  ChatMessageSenderRole,
  ChatMessageType,
  ChatReportReason,
  ChatReportStatus,
  ChatRoomStatus,
  PushApp,
  UserRole,
} from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/auth.types';

jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsService {},
}));

import { ChatService } from './chat.service';

describe('ChatService', () => {
  const customerUser: AuthenticatedUser = {
    id: 'customer-user-1',
    email: 'customer@test.com',
    name: 'Customer',
    role: UserRole.CUSTOMER,
    hasDriverProfile: false,
  };

  const driverUser: AuthenticatedUser = {
    id: 'driver-user-1',
    email: 'driver@test.com',
    name: 'Driver',
    role: UserRole.DRIVER,
    hasDriverProfile: true,
  };

  const createService = () => {
    const prisma = {
      transportRequest: {
        findUnique: jest.fn().mockResolvedValue({
          assignedDriverId: 'driver-profile-1',
          acceptedOfferId: 'offer-1',
        }),
      },
      requestFile: {
        create: jest.fn().mockResolvedValue({ id: 'private-file' }),
      },
      driverProfile: {
        findUnique: jest.fn(),
      },
      chatRoom: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      chatMessage: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      chatBlock: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      chatReport: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const notificationsService = {
      notifyChatMessage: jest.fn().mockResolvedValue(undefined),
    };

    return {
      prisma,
      notificationsService,
      service: new ChatService(prisma as never, notificationsService as never),
    };
  };

  const roomRecord = {
    client: { nickname: 'Road Runner' },
    id: 'room-1',
    transportRequestId: 'request-1',
    clientId: 'customer-user-1',
    driverId: 'driver-profile-1',
    acceptedOfferId: 'offer-1',
    status: ChatRoomStatus.ACTIVE,
    createdAt: new Date('2026-07-09T12:00:00.000Z'),
    updatedAt: new Date('2026-07-09T12:00:00.000Z'),
    closedAt: null,
    acceptedOffer: {
      id: 'offer-1',
      driverId: 'driver-profile-1',
    },
    driver: {
      id: 'driver-profile-1',
      userId: 'driver-user-1',
    },
    messages: [],
  };

  it('shows the customer nickname in driver chat summaries', async () => {
    const { prisma, service } = createService();
    prisma.driverProfile.findUnique.mockResolvedValue({ id: 'driver-profile-1' });
    prisma.chatRoom.findMany.mockResolvedValue([roomRecord]);
    const rooms = await service.listRooms(driverUser);
    expect(rooms[0].clientNickname).toBe('Road Runner');
    prisma.chatRoom.findMany.mockResolvedValue([{ ...roomRecord, client: { nickname: null, name: 'Private Name' } }]);
    expect((await service.listRooms(driverUser))[0].clientNickname).toBe('Customer');
  });

  it('identifies the customer by nickname in driver message notifications', async () => {
    const { prisma, notificationsService, service } = createService();
    prisma.chatRoom.findUnique.mockResolvedValue(roomRecord);
    prisma.chatMessage.create.mockResolvedValue({
      id: 'message-nickname', chatRoomId: roomRecord.id, senderId: customerUser.id,
      senderRole: ChatMessageSenderRole.CLIENT, type: ChatMessageType.TEXT,
      body: 'Hello', attachmentUrl: null, createdAt: new Date(), readAt: null,
    });
    await service.sendTextMessage({ user: customerUser, roomId: roomRecord.id, body: 'Hello' });
    expect(notificationsService.notifyChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      recipientApp: PushApp.DRIVER, senderNickname: 'Road Runner',
    }));
  });

  it('creates or reuses the room for an accepted offer via upsert', async () => {
    const { prisma, service } = createService();
    prisma.chatRoom.upsert.mockResolvedValue({ id: 'room-1' });

    const result = await service.ensureRoomForAcceptedOffer(prisma as never, {
      transportRequestId: 'request-1',
      clientId: 'customer-user-1',
      driverId: 'driver-profile-1',
      acceptedOfferId: 'offer-1',
    });

    expect(result).toEqual({ id: 'room-1' });
    expect(prisma.chatRoom.upsert).toHaveBeenCalledWith({
      where: { transportRequestId: 'request-1' },
      update: {
        clientId: 'customer-user-1',
        driverId: 'driver-profile-1',
        acceptedOfferId: 'offer-1',
        status: ChatRoomStatus.ACTIVE,
        closedAt: null,
      },
      create: {
        transportRequestId: 'request-1',
        clientId: 'customer-user-1',
        driverId: 'driver-profile-1',
        acceptedOfferId: 'offer-1',
        status: ChatRoomStatus.ACTIVE,
      },
      select: { id: true },
    });
  });

  it('allows the accepted driver to send a message and notifies the customer app', async () => {
    const { prisma, notificationsService, service } = createService();
    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-profile-1',
    });
    prisma.chatRoom.findUnique.mockResolvedValue(roomRecord);
    prisma.chatMessage.create.mockResolvedValue({
      id: 'message-1',
      chatRoomId: 'room-1',
      senderId: 'driver-profile-1',
      senderRole: ChatMessageSenderRole.DRIVER,
      type: ChatMessageType.TEXT,
      body: 'On my way.',
      attachmentUrl: null,
      createdAt: new Date('2026-07-09T12:05:00.000Z'),
      readAt: null,
    });
    prisma.chatRoom.update.mockResolvedValue(undefined);

    const message = await service.sendTextMessage({
      user: driverUser,
      roomId: 'room-1',
      body: ' On my way. ',
    });

    expect(message.senderRole).toBe(ChatMessageSenderRole.DRIVER);
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: {
        chatRoomId: 'room-1',
        senderId: 'driver-profile-1',
        senderRole: ChatMessageSenderRole.DRIVER,
        type: ChatMessageType.TEXT,
        body: 'On my way.',
      },
    });
    expect(notificationsService.notifyChatMessage).toHaveBeenCalledWith({
      recipientUserId: 'customer-user-1',
      recipientApp: PushApp.CUSTOMER,
      chatRoomId: 'room-1',
      transportRequestId: 'request-1',
      body: 'On my way.',
    });
  });

  it('blocks a rejected or unrelated driver from accessing the room', async () => {
    const { prisma, service } = createService();
    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-profile-2',
    });
    prisma.chatRoom.findUnique.mockResolvedValue(roomRecord);

    await expect(
      service.assertCanAccessRoom({
        user: driverUser,
        roomId: 'room-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stops either participant from messaging after a block', async () => {
    const { prisma, service } = createService();
    prisma.chatRoom.findUnique.mockResolvedValue(roomRecord);
    prisma.chatBlock.findFirst.mockResolvedValue({
      blockerUserId: 'customer-user-1',
    });

    await expect(
      service.sendTextMessage({
        user: customerUser,
        roomId: 'room-1',
        body: 'Hello',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('reports a message from the other participant for moderation', async () => {
    const { prisma, service } = createService();
    prisma.chatRoom.findUnique.mockResolvedValue(roomRecord);
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 'message-1' });
    prisma.chatReport.create.mockResolvedValue({
      id: 'report-1',
      chatRoomId: 'room-1',
      messageId: 'message-1',
      reason: ChatReportReason.HARASSMENT,
      status: ChatReportStatus.PENDING,
      createdAt: new Date('2026-07-09T12:06:00.000Z'),
    });

    const report = await service.createReport({
      user: customerUser,
      roomId: 'room-1',
      messageId: 'message-1',
      reason: ChatReportReason.HARASSMENT,
      details: 'Repeated insults',
    });

    expect(report.status).toBe(ChatReportStatus.PENDING);
    expect(prisma.chatMessage.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'message-1',
        chatRoomId: 'room-1',
        senderRole: ChatMessageSenderRole.DRIVER,
      },
      select: { id: true },
    });
  });

  it('allows reading but blocks sending when the room is closed', async () => {
    const { prisma, service } = createService();
    prisma.chatRoom.findUnique.mockResolvedValue({
      ...roomRecord,
      status: ChatRoomStatus.CLOSED,
    });
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.$transaction.mockResolvedValue([[], 0]);

    await expect(
      service.sendTextMessage({
        user: customerUser,
        roomId: 'room-1',
        body: 'Hello',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const messages = await service.getRoomMessages({
      user: customerUser,
      roomId: 'room-1',
      page: 1,
      limit: 20,
    });

    expect(messages.room.status).toBe(ChatRoomStatus.CLOSED);
  });

  it('marks only the other participant messages as read', async () => {
    const { prisma, service } = createService();
    prisma.chatRoom.findUnique.mockResolvedValue(roomRecord);
    prisma.chatMessage.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.markRoomAsRead({
      user: customerUser,
      roomId: 'room-1',
    });

    expect(result.readCount).toBe(3);
    expect(prisma.chatMessage.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          chatRoomId: 'room-1',
          senderRole: ChatMessageSenderRole.DRIVER,
          readAt: null,
        },
      }),
    );
    expect(result.readAt).toEqual(expect.any(String));
  });
  describe('private attachments', () => {
    const file = {
      buffer: Buffer.from('%PDF-1.7\nattachment'),
      originalname: 'extra.pdf',
      mimetype: 'application/pdf',
      size: 20,
    };
    it('creates a private file and a FILE message in the same transaction', async () => {
      const { service, prisma } = createService();
      prisma.chatRoom.findUnique.mockResolvedValue(roomRecord);
      prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
      prisma.chatMessage.create.mockResolvedValue({
        id: 'm',
        chatRoomId: 'room-1',
        senderId: customerUser.id,
        senderRole: ChatMessageSenderRole.CLIENT,
        type: ChatMessageType.FILE,
        body: 'extra.pdf',
        attachmentUrl: '/request-files/private-file/content',
        createdAt: new Date(),
        readAt: null,
      });
      const message = await service.sendAttachment({
        user: customerUser,
        roomId: 'room-1',
        file,
      });
      expect(message.type).toBe('FILE');
      expect(message.attachmentUrl).toBe('/request-files/private-file/content');
      expect(prisma.requestFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: 'CHAT',
            requestId: 'request-1',
            uploadedById: customerUser.id,
          }),
        }),
      );
    });
    it('rejects blocked chat attachments before storing files', async () => {
      const { service, prisma } = createService();
      prisma.chatRoom.findUnique.mockResolvedValue(roomRecord);
      prisma.chatBlock.findFirst.mockResolvedValue({
        blockerUserId: customerUser.id,
      });
      await expect(
        service.sendAttachment({ user: customerUser, roomId: 'room-1', file }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.requestFile.create).not.toHaveBeenCalled();
    });
    it('rejects closed chat attachments', async () => {
      const { service, prisma } = createService();
      prisma.chatRoom.findUnique.mockResolvedValue({
        ...roomRecord,
        status: ChatRoomStatus.CLOSED,
      });
      await expect(
        service.sendAttachment({ user: customerUser, roomId: 'room-1', file }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.requestFile.create).not.toHaveBeenCalled();
    });
    it('rejects files in a room belonging to a formerly selected driver', async () => {
      const { service, prisma } = createService();
      prisma.chatRoom.findUnique.mockResolvedValue(roomRecord);
      prisma.transportRequest.findUnique.mockResolvedValue({
        assignedDriverId: 'different-driver',
        acceptedOfferId: 'different-offer',
      });
      await expect(
        service.sendAttachment({ user: customerUser, roomId: 'room-1', file }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.requestFile.create).not.toHaveBeenCalled();
    });
  });
});
