import { PushApp } from '@prisma/client';

jest.mock('expo-server-sdk', () => ({
  Expo: class Expo {
    static isExpoPushToken(token: string): boolean {
      return token.startsWith('ExponentPushToken[');
    }

    chunkPushNotifications(messages: unknown[]): unknown[] {
      return [messages];
    }

    async sendPushNotificationsAsync(): Promise<unknown[]> {
      return [];
    }

    chunkPushNotificationReceiptIds(receiptIds: string[]): string[][] {
      return [receiptIds];
    }

    async getPushNotificationReceiptsAsync(): Promise<Record<string, unknown>> {
      return {};
    }
  },
}));

import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('deactivates invalid Expo tokens and skips sending them', async () => {
    const prisma = {
      pushToken: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'token-1', token: 'invalid-token' },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const service = new NotificationsService(prisma as never);
    const expo = {
      chunkPushNotifications: jest.fn(),
      sendPushNotificationsAsync: jest.fn(),
      chunkPushNotificationReceiptIds: jest.fn(),
      getPushNotificationReceiptsAsync: jest.fn(),
    };

    Object.assign(service as object, { expo });

    await service.sendToUsers({
      userIds: ['driver-user-1'],
      app: PushApp.DRIVER,
      title: 'New transport request',
      body: 'A new transport job is available.',
      type: 'NEW_TRANSPORT_REQUEST',
      data: { requestId: 'req_1' },
    });

    expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ['driver-user-1'] },
        app: PushApp.DRIVER,
        isActive: true,
      },
      select: {
        id: true,
        token: true,
      },
    });
    expect(prisma.pushToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['token-1'] } },
      data: { isActive: false },
    });
    expect(expo.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('builds the correct generic payload for new driver offers', async () => {
    const prisma = {
      pushToken: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const service = new NotificationsService(prisma as never);
    const sendToUsersSpy = jest
      .spyOn(service, 'sendToUsers')
      .mockResolvedValue(undefined);

    await service.notifyCustomerAboutDriverOffer({
      customerId: 'customer-1',
      requestId: 'request-1',
      offerId: 'offer-1',
      driverName: 'John Driver',
    });

    expect(sendToUsersSpy).toHaveBeenCalledWith({
      userIds: ['customer-1'],
      app: PushApp.CUSTOMER,
      title: 'New driver offer',
      body: 'John Driver sent you an offer.',
      type: 'NEW_DRIVER_OFFER',
      data: {
        requestId: 'request-1',
        offerId: 'offer-1',
      },
    });
  });
});
