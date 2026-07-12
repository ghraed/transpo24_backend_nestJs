const sendNotification = jest.fn();
const setVapidDetails = jest.fn();

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    sendNotification,
    setVapidDetails,
  },
}));

import { WebPushProvider } from './web-push.provider';

describe('WebPushProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key',
      WEB_PUSH_VAPID_PRIVATE_KEY: 'private-key',
      WEB_PUSH_VAPID_SUBJECT: 'mailto:admin@transpo24.com',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sends to multiple subscriptions for the same user', async () => {
    const prisma = {
      webPushSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            endpoint: 'https://push.example.com/1',
            p256dh: 'p256dh-1',
            auth: 'auth-1',
            expirationTime: null,
          },
          {
            id: 'sub-2',
            endpoint: 'https://push.example.com/2',
            p256dh: 'p256dh-2',
            auth: 'auth-2',
            expirationTime: null,
          },
        ]),
      },
    };

    const provider = new WebPushProvider(
      prisma as never,
      {
        deleteById: jest.fn(),
      } as never,
    );

    await provider.sendToUser('admin-1', {
      id: 'notification-1',
      type: 'DRIVER_REVIEW_SUBMITTED',
      title: 'New driver review request',
      body: 'A driver submitted onboarding documents for review.',
      url: '/driver-reviews',
    });

    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('removes expired subscriptions after a 410 response', async () => {
    sendNotification.mockRejectedValueOnce({
      statusCode: 410,
      message: 'Gone',
    });

    const deleteById = jest.fn().mockResolvedValue(undefined);
    const provider = new WebPushProvider(
      {
        webPushSubscription: {
          findMany: jest.fn(),
        },
      } as never,
      {
        deleteById,
      } as never,
    );

    await provider.sendToSubscription(
      {
        id: 'sub-expired',
        endpoint: 'https://push.example.com/expired',
        p256dh: 'p256dh',
        auth: 'auth',
        expirationTime: null,
        userId: 'admin-1',
        userAgent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'notification-2',
        type: 'DRIVER_REVIEW_SUBMITTED',
        title: 'New driver review request',
        body: 'A driver submitted onboarding documents for review.',
      },
    );

    expect(deleteById).toHaveBeenCalledWith('sub-expired');
  });

  it('keeps subscriptions on temporary failures', async () => {
    sendNotification.mockRejectedValueOnce({
      statusCode: 503,
      message: 'Service unavailable',
    });

    const deleteById = jest.fn().mockResolvedValue(undefined);
    const provider = new WebPushProvider(
      {
        webPushSubscription: {
          findMany: jest.fn(),
        },
      } as never,
      {
        deleteById,
      } as never,
    );

    await provider.sendToSubscription(
      {
        id: 'sub-temporary',
        endpoint: 'https://push.example.com/temporary',
        p256dh: 'p256dh',
        auth: 'auth',
        expirationTime: null,
        userId: 'admin-1',
        userAgent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'notification-3',
        type: 'DRIVER_REVIEW_SUBMITTED',
        title: 'New driver review request',
        body: 'A driver submitted onboarding documents for review.',
      },
    );

    expect(deleteById).not.toHaveBeenCalled();
  });
});
