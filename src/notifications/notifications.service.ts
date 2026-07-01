import { Injectable, Logger } from '@nestjs/common';
import { PushApp } from '@prisma/client';
import {
  Expo,
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushSuccessTicket,
  type ExpoPushTicket,
} from 'expo-server-sdk';

import { PrismaService } from '../prisma/prisma.service';
import type {
  PushNotificationType,
  SendPushNotificationInput,
} from './notifications.types';

type PushTokenRecord = {
  id: string;
  token: string;
  platform: 'ios' | 'android';
};

const EXPO_DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';
const TRANSPORT_JOBS_CHANNEL_ID = 'transport_jobs';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo = new Expo();

  constructor(private readonly prisma: PrismaService) {}

  async sendToUsers(input: SendPushNotificationInput): Promise<void> {
    const userIds = Array.from(
      new Set(input.userIds.map((userId) => userId.trim()).filter(Boolean)),
    );

    if (userIds.length === 0) {
      return;
    }

    try {
      const storedTokens = await this.prisma.pushToken.findMany({
        where: {
          userId: { in: userIds },
          app: input.app,
          isActive: true,
        },
        select: {
          id: true,
          token: true,
          platform: true,
        },
      });

      if (storedTokens.length === 0) {
        return;
      }

      const validTokens: PushTokenRecord[] = [];
      const invalidTokenIds: string[] = [];

      for (const storedToken of storedTokens) {
        if (Expo.isExpoPushToken(storedToken.token)) {
          validTokens.push(storedToken);
        } else {
          invalidTokenIds.push(storedToken.id);
        }
      }

      await this.deactivateTokensByIds(invalidTokenIds);

      if (validTokens.length === 0) {
        return;
      }

      const messages: ExpoPushMessage[] = validTokens.map((storedToken) => ({
        to: storedToken.token,
        title: input.title,
        body: input.body,
        ...(storedToken.platform === 'ios' ? { sound: 'default' as const } : {}),
        priority: 'high',
        channelId: TRANSPORT_JOBS_CHANNEL_ID,
        data: {
          type: input.type,
          ...(input.data ?? {}),
        },
      }));

      const messageChunks = this.expo.chunkPushNotifications(messages);
      const receiptTokenIds = new Map<string, string>();
      let offset = 0;

      for (const chunk of messageChunks) {
        const chunkTokens = validTokens.slice(offset, offset + chunk.length);
        offset += chunk.length;

        let tickets: ExpoPushTicket[];
        try {
          tickets = await this.expo.sendPushNotificationsAsync(chunk);
        } catch (error) {
          this.logger.error(
            `Failed to send Expo push notification chunk: ${this.toErrorMessage(error)}`,
          );
          continue;
        }

        await this.handleTickets(chunkTokens, tickets, receiptTokenIds, input.type);
      }

      await this.resolveReceipts(receiptTokenIds, input.type);
    } catch (error) {
      this.logger.error(
        `Push notification dispatch failed for ${input.type}: ${this.toErrorMessage(error)}`,
      );
    }
  }

  async notifyDriversAboutNewTransportRequest(input: {
    driverIds: string[];
    requestId: string;
  }): Promise<void> {
    await this.sendToUsers({
      userIds: input.driverIds,
      app: PushApp.DRIVER,
      title: 'New transport request',
      body: 'A new transport job is available. Send your offer now.',
      type: 'NEW_TRANSPORT_REQUEST',
      data: {
        requestId: input.requestId,
      },
    });
  }

  async notifyCustomerAboutDriverOffer(input: {
    customerId: string;
    requestId: string;
    offerId: string;
    driverName?: string;
  }): Promise<void> {
    const normalizedDriverName = input.driverName?.trim();

    await this.sendToUsers({
      userIds: [input.customerId],
      app: PushApp.CUSTOMER,
      title: 'New driver offer',
      body:
        normalizedDriverName && normalizedDriverName.length > 0
          ? `${normalizedDriverName} sent you an offer.`
          : 'A driver sent you a new offer.',
      type: 'NEW_DRIVER_OFFER',
      data: {
        requestId: input.requestId,
        offerId: input.offerId,
      },
    });
  }

  private async handleTickets(
    chunkTokens: PushTokenRecord[],
    tickets: ExpoPushTicket[],
    receiptTokenIds: Map<string, string>,
    notificationType: PushNotificationType,
  ): Promise<void> {
    const tokensToDeactivate: string[] = [];

    tickets.forEach((ticket, index) => {
      const tokenRecord = chunkTokens[index];
      if (!tokenRecord) {
        return;
      }

      if (ticket.status === 'ok') {
        const receiptId = (ticket as ExpoPushSuccessTicket).id;
        if (receiptId) {
          receiptTokenIds.set(receiptId, tokenRecord.id);
        }
        return;
      }

      const ticketDetails = 'details' in ticket ? ticket.details : undefined;
      const expoError =
        typeof ticketDetails?.error === 'string' ? ticketDetails.error : null;
      if (expoError === EXPO_DEVICE_NOT_REGISTERED) {
        tokensToDeactivate.push(tokenRecord.id);
      }

      this.logger.warn(
        `Expo push ticket error for ${notificationType}: ${ticket.message ?? expoError ?? 'Unknown error'}`,
      );
    });

    await this.deactivateTokensByIds(tokensToDeactivate);
  }

  private async resolveReceipts(
    receiptTokenIds: Map<string, string>,
    notificationType: PushNotificationType,
  ): Promise<void> {
    const receiptIds = Array.from(receiptTokenIds.keys());
    if (receiptIds.length === 0) {
      return;
    }

    const receiptChunks = this.expo.chunkPushNotificationReceiptIds(receiptIds);

    for (const chunk of receiptChunks) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
        await this.handleReceipts(receipts, receiptTokenIds, notificationType);
      } catch (error) {
        this.logger.error(
          `Failed to fetch Expo push receipts for ${notificationType}: ${this.toErrorMessage(error)}`,
        );
      }
    }
  }

  private async handleReceipts(
    receipts: Record<string, ExpoPushReceipt>,
    receiptTokenIds: Map<string, string>,
    notificationType: PushNotificationType,
  ): Promise<void> {
    const tokensToDeactivate: string[] = [];

    for (const [receiptId, receipt] of Object.entries(receipts)) {
      if (receipt.status === 'ok') {
        continue;
      }

      const expoError =
        typeof receipt.details?.error === 'string' ? receipt.details.error : null;
      const tokenId = receiptTokenIds.get(receiptId);

      if (expoError === EXPO_DEVICE_NOT_REGISTERED && tokenId) {
        tokensToDeactivate.push(tokenId);
      }

      this.logger.warn(
        `Expo push receipt error for ${notificationType}: ${receipt.message ?? expoError ?? 'Unknown error'}`,
      );
    }

    await this.deactivateTokensByIds(tokensToDeactivate);
  }

  private async deactivateTokensByIds(tokenIds: string[]): Promise<void> {
    const uniqueTokenIds = Array.from(new Set(tokenIds.filter(Boolean)));
    if (uniqueTokenIds.length === 0) {
      return;
    }

    await this.prisma.pushToken.updateMany({
      where: { id: { in: uniqueTokenIds } },
      data: { isActive: false },
    });
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error';
  }
}
