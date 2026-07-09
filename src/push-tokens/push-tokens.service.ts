import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PushApp, PushPlatform, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type RegisterPushTokenInput = {
  userId: string;
  role: UserRole;
  hasDriverProfile: boolean;
  token: string;
  app: PushApp;
  platform: PushPlatform;
  deviceName?: string;
};

@Injectable()
export class PushTokensService {
  private readonly logger = new Logger(PushTokensService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerToken(
    input: RegisterPushTokenInput,
  ): Promise<{ success: true }> {
    this.assertRoleMatchesApp(input.role, input.app, input.hasDriverProfile);

    await this.prisma.pushToken.upsert({
      where: { token: input.token.trim() },
      update: {
        userId: input.userId,
        app: input.app,
        platform: input.platform,
        deviceName: input.deviceName?.trim() || null,
        isActive: true,
      },
      create: {
        userId: input.userId,
        app: input.app,
        platform: input.platform,
        token: input.token.trim(),
        deviceName: input.deviceName?.trim() || null,
        isActive: true,
      },
    });

    this.logger.debug(
      `Registered Expo push token for user ${input.userId} (${input.app}).`,
    );

    return { success: true };
  }

  private assertRoleMatchesApp(
    role: UserRole,
    app: PushApp,
    hasDriverProfile: boolean,
  ): void {
    if (
      (role === UserRole.CUSTOMER && app === PushApp.CUSTOMER) ||
      ((role === UserRole.DRIVER || hasDriverProfile) && app === PushApp.DRIVER)
    ) {
      return;
    }

    throw new ForbiddenException(
      'The authenticated user cannot register a push token for this app.',
    );
  }
}
