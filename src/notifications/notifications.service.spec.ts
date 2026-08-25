import { PushApp } from '@prisma/client';

jest.mock('expo-server-sdk', () => ({
  Expo: class Expo {
    static isExpoPushToken(token: string): boolean {
      return token.startsWith('ExponentPushToken[');
    }

    chunkPushNotifications(messages: unknown[]): unknown[] {
      return [messages];
    }

    sendPushNotificationsAsync(): Promise<unknown[]> {
      return Promise.resolve([]);
    }

    chunkPushNotificationReceiptIds(receiptIds: string[]): string[][] {
      return [receiptIds];
    }

    getPushNotificationReceiptsAsync(): Promise<Record<string, unknown>> {
      return Promise.resolve({});
    }
  },
}));

import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  function createService(prisma: object): NotificationsService {
    return new NotificationsService(
      prisma as never,
      {
        sendToUser: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  }

  it('deactivates invalid Expo tokens and skips sending them', async () => {
    const prisma = {
      pushToken: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'token-1', token: 'invalid-token' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const service = createService(prisma);
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
        platform: true,
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

    const service = createService(prisma);
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

  it('sends selected-driver notifications to the driver user account', async () => {
    const prisma = {
      pushToken: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const service = createService(prisma);
    const sendToUsersSpy = jest
      .spyOn(service, 'sendToUsers')
      .mockResolvedValue(undefined);

    await service.notifyDriverSelected({
      driverUserId: 'driver-user-1',
      requestId: 'request-1',
      serviceType: 'Vehicle transport',
    });

    expect(sendToUsersSpy).toHaveBeenCalledWith({
      userIds: ['driver-user-1'],
      app: PushApp.DRIVER,
      title: 'Customer selected you',
      body: 'You were selected for Vehicle transport.',
      type: 'DRIVER_SELECTED',
      data: {
        requestId: 'request-1',
        serviceType: 'Vehicle transport',
      },
    });
  });

  it('builds the correct payload for approved drivers', async () => {
    const prisma = {
      pushToken: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const service = createService(prisma);
    const sendToUsersSpy = jest
      .spyOn(service, 'sendToUsers')
      .mockResolvedValue(undefined);

    await service.notifyDriverApproved({
      driverUserId: 'driver-user-1',
      driverName: 'John Driver',
    });

    expect(sendToUsersSpy).toHaveBeenCalledWith({
      userIds: ['driver-user-1'],
      app: PushApp.DRIVER,
      title: 'Driver account approved',
      body: 'John Driver, your driver account is approved. You can now start receiving transport requests.',
      type: 'DRIVER_APPROVED',
      data: {
        driverApproved: true,
      },
    });
  });

  it('maps a normalized browser payload to a safe relative admin URL', () => {
    const service = createService({
      pushToken: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    });

    expect(
      service.toBrowserPushPayload({
        type: 'DRIVER_REVIEW_SUBMITTED',
        title: 'New driver review request',
        body: 'A driver submitted onboarding documents for review.',
        url: 'https://evil.example.com',
        data: {
          driverProfileId: 'driver-profile-1',
        },
      }),
    ).toMatchObject({
      type: 'DRIVER_REVIEW_SUBMITTED',
      title: 'New driver review request',
      body: 'A driver submitted onboarding documents for review.',
      url: '/',
      tag: 'driver_review_submitted',
      data: {
        driverProfileId: 'driver-profile-1',
      },
    });
  });

  it('sends browser push notifications to every active admin user', async () => {
    const sendToUser = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]),
      },
      pushToken: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const service = new NotificationsService(
      prisma as never,
      { sendToUser } as never,
    );

    await service.notifyAdminsAboutDriverReviewSubmission({
      driverProfileId: 'driver-profile-1',
      driverName: 'Review Driver',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        role: 'ADMIN',
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    expect(sendToUser).toHaveBeenCalledTimes(2);
    expect(sendToUser).toHaveBeenNthCalledWith(
      1,
      'admin-1',
      expect.objectContaining({
        type: 'DRIVER_REVIEW_SUBMITTED',
        title: 'New driver review request',
        body: 'Review Driver submitted onboarding documents for review.',
        url: '/driver-reviews',
      }),
    );
    expect(sendToUser).toHaveBeenNthCalledWith(
      2,
      'admin-2',
      expect.objectContaining({
        type: 'DRIVER_REVIEW_SUBMITTED',
      }),
    );
  });
});
