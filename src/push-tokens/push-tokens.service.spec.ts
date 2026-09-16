import { ForbiddenException } from '@nestjs/common';
import { PushApp, PushPlatform, UserRole } from '@prisma/client';

import { PushTokensService } from './push-tokens.service';

describe('PushTokensService', () => {
  beforeEach(() => {
    process.env.PUSH_ENVIRONMENT = 'DEVELOPMENT';
  });
  it('upserts a token for a matching role/app pair', async () => {
    const prisma = {
      pushToken: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };

    const service = new PushTokensService(prisma as never);

    await expect(
      service.registerToken({
        userId: 'customer-1',
        role: UserRole.CUSTOMER,
        hasDriverProfile: false,
        token: 'ExponentPushToken[abc123]',
        app: PushApp.CUSTOMER,
        applicationId: 'com.transpo24.app.dev',
        platform: PushPlatform.android,
        deviceName: 'Pixel',
      }),
    ).resolves.toEqual({ success: true });

    expect(prisma.pushToken.upsert).toHaveBeenCalledWith({
      where: {
        token: 'ExponentPushToken[abc123]',
        OR: [
          { environment: null, applicationId: null },
          {
            environment: 'DEVELOPMENT',
            applicationId: 'com.transpo24.app.dev',
          },
        ],
      },
      update: {
        environment: 'DEVELOPMENT',
        userId: 'customer-1',
        app: PushApp.CUSTOMER,
        applicationId: 'com.transpo24.app.dev',
        platform: PushPlatform.android,
        deviceName: 'Pixel',
        isActive: true,
      },
      create: {
        environment: 'DEVELOPMENT',
        userId: 'customer-1',
        app: PushApp.CUSTOMER,
        applicationId: 'com.transpo24.app.dev',
        platform: PushPlatform.android,
        token: 'ExponentPushToken[abc123]',
        deviceName: 'Pixel',
        isActive: true,
      },
    });
  });

  it('rejects mismatched role/app pairs', async () => {
    const prisma = {
      pushToken: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };

    const service = new PushTokensService(prisma as never);

    await expect(
      service.registerToken({
        userId: 'customer-1',
        role: UserRole.CUSTOMER,
        hasDriverProfile: false,
        token: 'ExponentPushToken[abc123]',
        app: PushApp.DRIVER,
        applicationId: 'com.transpo24.driver.dev',
        platform: PushPlatform.ios,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows driver app tokens for shared customer accounts with a driver profile', async () => {
    const prisma = {
      pushToken: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };

    const service = new PushTokensService(prisma as never);

    await expect(
      service.registerToken({
        userId: 'customer-driver-1',
        role: UserRole.CUSTOMER,
        hasDriverProfile: true,
        token: 'ExponentPushToken[driver123]',
        app: PushApp.DRIVER,
        applicationId: 'com.transpo24.driver.dev',
        platform: PushPlatform.ios,
      }),
    ).resolves.toEqual({ success: true });
  });
});
