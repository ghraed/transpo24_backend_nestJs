import { UserRole } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

import { WebPushSubscriptionsService } from './web-push-subscriptions.service';

describe('WebPushSubscriptionsService', () => {
  it('upserts a browser subscription for the authenticated admin', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'sub-1',
      userId: 'admin-1',
      endpoint: 'https://example.com/push/1',
      p256dh: 'p256dh',
      auth: 'auth',
      expirationTime: BigInt(123),
      userAgent: 'Chrome',
      createdAt: new Date('2026-07-12T10:00:00.000Z'),
      updatedAt: new Date('2026-07-12T10:00:00.000Z'),
    });
    const prisma = {
      webPushSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert,
      },
    };

    const service = new WebPushSubscriptionsService(prisma as never);

    await expect(
      service.upsert({
        userId: 'admin-1',
        role: UserRole.ADMIN,
        subscription: {
          endpoint: 'https://example.com/push/1',
          expirationTime: 123,
          keys: { p256dh: 'p256dh', auth: 'auth' },
          userAgent: 'Chrome',
        },
      }),
    ).resolves.toEqual({
      id: 'sub-1',
      endpoint: 'https://example.com/push/1',
      expirationTime: 123,
      userAgent: 'Chrome',
      createdAt: '2026-07-12T10:00:00.000Z',
      updatedAt: '2026-07-12T10:00:00.000Z',
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://example.com/push/1' },
      update: {
        userId: 'admin-1',
        p256dh: 'p256dh',
        auth: 'auth',
        expirationTime: BigInt(123),
        userAgent: 'Chrome',
      },
      create: {
        userId: 'admin-1',
        endpoint: 'https://example.com/push/1',
        p256dh: 'p256dh',
        auth: 'auth',
        expirationTime: BigInt(123),
        userAgent: 'Chrome',
      },
    });
  });

  it('reuses the same endpoint without creating duplicates', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'sub-1',
      userId: 'admin-1',
      endpoint: 'https://example.com/push/1',
      p256dh: 'new-key',
      auth: 'new-auth',
      expirationTime: null,
      userAgent: null,
      createdAt: new Date('2026-07-12T10:00:00.000Z'),
      updatedAt: new Date('2026-07-12T11:00:00.000Z'),
    });
    const prisma = {
      webPushSubscription: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sub-1',
          userId: 'admin-1',
        }),
        upsert,
      },
    };

    const service = new WebPushSubscriptionsService(prisma as never);

    await service.upsert({
      userId: 'admin-1',
      role: UserRole.ADMIN,
      subscription: {
        endpoint: 'https://example.com/push/1',
        expirationTime: null,
        keys: { p256dh: 'new-key', auth: 'new-auth' },
      },
    });

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('only deletes subscriptions owned by the authenticated admin', async () => {
    const prisma = {
      webPushSubscription: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sub-2',
          userId: 'admin-2',
        }),
        delete: jest.fn(),
      },
    };

    const service = new WebPushSubscriptionsService(prisma as never);

    await expect(
      service.remove({
        userId: 'admin-1',
        role: UserRole.ADMIN,
        endpoint: 'https://example.com/push/2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.webPushSubscription.delete).not.toHaveBeenCalled();
  });

  it('returns success when the subscription is already missing', async () => {
    const prisma = {
      webPushSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new WebPushSubscriptionsService(prisma as never);

    await expect(
      service.remove({
        userId: 'admin-1',
        role: UserRole.ADMIN,
        endpoint: 'https://example.com/push/404',
      }),
    ).resolves.toEqual({ success: true });
  });
});
