import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { UserRole, type WebPushSubscription } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateWebPushSubscriptionDto } from './dto/create-web-push-subscription.dto';

type UpsertWebPushSubscriptionInput = {
  userId: string;
  role: UserRole;
  subscription: CreateWebPushSubscriptionDto;
};

@Injectable()
export class WebPushSubscriptionsService {
  private readonly logger = new Logger(WebPushSubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string): Promise<WebPushSubscriptionResponseDto[]> {
    const subscriptions = await this.prisma.webPushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return subscriptions.map((subscription) =>
      this.toResponseDto(subscription),
    );
  }

  async upsert(
    input: UpsertWebPushSubscriptionInput,
  ): Promise<WebPushSubscriptionResponseDto> {
    this.assertAdminAccess(input.role);

    const endpoint = input.subscription.endpoint.trim();
    const existing = await this.prisma.webPushSubscription.findUnique({
      where: { endpoint },
      select: {
        id: true,
        userId: true,
      },
    });

    const record = await this.prisma.webPushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: input.userId,
        p256dh: input.subscription.keys.p256dh.trim(),
        auth: input.subscription.keys.auth.trim(),
        expirationTime:
          typeof input.subscription.expirationTime === 'number'
            ? BigInt(Math.trunc(input.subscription.expirationTime))
            : null,
        userAgent: input.subscription.userAgent?.trim() || null,
      },
      create: {
        userId: input.userId,
        endpoint,
        p256dh: input.subscription.keys.p256dh.trim(),
        auth: input.subscription.keys.auth.trim(),
        expirationTime:
          typeof input.subscription.expirationTime === 'number'
            ? BigInt(Math.trunc(input.subscription.expirationTime))
            : null,
        userAgent: input.subscription.userAgent?.trim() || null,
      },
    });

    if (existing && existing.userId !== input.userId) {
      this.logger.warn(
        `Reassigned web push subscription ${record.id} to admin ${input.userId}.`,
      );
    }

    return this.toResponseDto(record);
  }

  async remove(input: {
    userId: string;
    role: UserRole;
    endpoint: string;
  }): Promise<{ success: true }> {
    this.assertAdminAccess(input.role);

    const endpoint = input.endpoint.trim();
    const existing = await this.prisma.webPushSubscription.findUnique({
      where: { endpoint },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!existing) {
      return { success: true };
    }

    if (existing.userId !== input.userId) {
      throw new ForbiddenException(
        'The authenticated user cannot remove this browser subscription.',
      );
    }

    await this.prisma.webPushSubscription.delete({
      where: { id: existing.id },
    });

    return { success: true };
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.webPushSubscription.delete({
      where: { id },
    });
  }

  private assertAdminAccess(role: UserRole): void {
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access is required.');
    }
  }

  private toResponseDto(
    subscription: WebPushSubscription,
  ): WebPushSubscriptionResponseDto {
    return {
      id: subscription.id,
      endpoint: subscription.endpoint,
      expirationTime:
        subscription.expirationTime === null
          ? null
          : Number(subscription.expirationTime),
      userAgent: subscription.userAgent,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    };
  }
}

export interface WebPushSubscriptionResponseDto {
  id: string;
  endpoint: string;
  expirationTime: number | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}
