import { Injectable, Logger } from '@nestjs/common';
import type { WebPushSubscription as PrismaWebPushSubscription } from '@prisma/client';
import webpush, { type PushSubscription, type RequestOptions } from 'web-push';

import { PrismaService } from '../prisma/prisma.service';
import type { BrowserPushNotificationPayload } from './notifications.types';
import { WebPushSubscriptionsService } from './web-push-subscriptions.service';

type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

type WebPushError = Error & {
  statusCode?: number;
  body?: unknown;
  headers?: Record<string, unknown>;
};

@Injectable()
export class WebPushProvider {
  private readonly logger = new Logger(WebPushProvider.name);
  private readonly config = this.readConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPushSubscriptionsService: WebPushSubscriptionsService,
  ) {
    if (this.config) {
      webpush.setVapidDetails(
        this.config.subject,
        this.config.publicKey,
        this.config.privateKey,
      );
    }
  }

  async sendToUser(
    userId: string,
    payload: BrowserPushNotificationPayload,
  ): Promise<void> {
    if (!this.config) {
      return;
    }

    const subscriptions = await this.prisma.webPushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (subscriptions.length === 0) {
      return;
    }

    await Promise.allSettled(
      subscriptions.map((subscription) =>
        this.sendToSubscription(subscription, payload),
      ),
    );
  }

  async sendToSubscription(
    subscription: PrismaWebPushSubscription,
    payload: BrowserPushNotificationPayload,
  ): Promise<void> {
    if (!this.config) {
      return;
    }

    try {
      await webpush.sendNotification(
        this.toPushSubscription(subscription),
        JSON.stringify(payload),
        this.toRequestOptions(payload),
      );
    } catch (error) {
      const webPushError = error as WebPushError;
      if (webPushError.statusCode === 404 || webPushError.statusCode === 410) {
        await this.webPushSubscriptionsService.deleteById(subscription.id);
        this.logger.warn(
          `Removed expired web push subscription ${subscription.id} after status ${webPushError.statusCode}.`,
        );
        return;
      }

      this.logger.warn(
        `Web push delivery failed for subscription ${subscription.id}: ${this.toSafeErrorSummary(webPushError)}`,
      );
    }
  }

  private toPushSubscription(
    subscription: PrismaWebPushSubscription,
  ): PushSubscription {
    return {
      endpoint: subscription.endpoint,
      expirationTime:
        subscription.expirationTime === null
          ? null
          : Number(subscription.expirationTime),
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };
  }

  private toRequestOptions(
    payload: BrowserPushNotificationPayload,
  ): RequestOptions {
    return {
      TTL: 60,
      urgency: 'high',
      topic: payload.tag?.slice(0, 32),
    };
  }

  private readConfig(): WebPushConfig | null {
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();

    if (!publicKey && !privateKey && !subject) {
      this.logger.warn(
        'Web Push is disabled because VAPID environment variables are not configured.',
      );
      return null;
    }

    if (!publicKey || !privateKey || !subject) {
      throw new Error(
        'WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_VAPID_SUBJECT must all be configured together.',
      );
    }

    if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
      throw new Error(
        'WEB_PUSH_VAPID_SUBJECT must start with mailto: or https://.',
      );
    }

    return {
      publicKey,
      privateKey,
      subject,
    };
  }

  private toSafeErrorSummary(error: WebPushError): string {
    const status =
      typeof error.statusCode === 'number' ? error.statusCode : null;
    return status === null
      ? error.message || 'Unexpected web push transport error'
      : `${status} ${error.message || 'Web push transport error'}`;
  }
}
