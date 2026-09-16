import { randomUUID } from 'node:crypto';

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PushApp, UserRole } from '@prisma/client';
import {
  Expo,
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushTicket,
} from 'expo-server-sdk';

import { PrismaService } from '../prisma/prisma.service';
import type {
  BrowserPushNotificationPayload,
  PushNotificationType,
  SendPushNotificationInput,
} from './notifications.types';
import { WebPushProvider } from './web-push.provider';
import { pushScope } from './push-environment';

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
  private readonly expo = new Expo({
    accessToken: process.env.EXPO_ACCESS_TOKEN?.trim() || undefined,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPushProvider: WebPushProvider,
  ) {}

  async sendTestToDevice(
    userId: string,
    app: PushApp,
    token: string,
  ): Promise<{ accepted: true }> {
    const storedToken = await this.prisma.pushToken.findFirst({
      where: { userId, app, token, isActive: true, ...pushScope(app) },
      select: { id: true },
    });
    if (!storedToken || !Expo.isExpoPushToken(token)) {
      throw new BadRequestException(
        'Register notifications on this device before testing.',
      );
    }
    let tickets: ExpoPushTicket[];
    try {
      tickets = await this.expo.sendPushNotificationsAsync([
        {
          to: token,
          title: 'Transpo24 test notification',
          body: 'Your test push notification has arrived.',
          sound: 'default',
          priority: 'high',
          channelId: TRANSPORT_JOBS_CHANNEL_ID,
          data: { type: 'TEST_NOTIFICATION' },
        },
      ]);
    } catch {
      throw new BadGatewayException(
        'Unable to reach the push notification service. Please try again.',
      );
    }
    const ticket = tickets[0];
    if (!ticket || ticket.status !== 'ok') {
      if (
        ticket?.status === 'error' &&
        ticket.details?.error === EXPO_DEVICE_NOT_REGISTERED
      ) {
        await this.deactivateTokensByIds([storedToken.id]);
      }
      throw new BadGatewayException(
        ticket?.status === 'error'
          ? `Push notification rejected: ${ticket.details?.error ?? 'Unknown error'}.`
          : 'The push notification service did not accept the test.',
      );
    }
    return { accepted: true };
  }

  async sendToUsers(input: SendPushNotificationInput): Promise<void> {
    const userIds = Array.from(
      new Set(input.userIds.map((userId) => userId.trim()).filter(Boolean)),
    );

    if (userIds.length === 0) {
      return;
    }

    try {
      // Save before inspecting device tokens: Alerts must work without push permission.
      if (input.app === PushApp.CUSTOMER) {
        const milestoneTypes = new Set([
          'NEW_DRIVER_OFFER',
          'DRIVER_GOING_TO_PICKUP',
          'DRIVER_ARRIVED_PICKUP',
          'ITEM_PICKED_UP',
          'DRIVER_GOING_TO_DROPOFF',
          'DRIVER_NEAR_DELIVERY',
          'ITEM_DELIVERED',
          'CUSTOMER_DELIVERY_CONFIRMED',
          'TRIP_CANCELLED',
          'TRIP_FUNDS_TRANSFERRED',
        ]);
        const eventId =
          input.type === 'NEW_DRIVER_OFFER'
            ? input.data?.offerId
            : (input.data?.tripId ?? input.data?.requestId);
        const eventKey =
          milestoneTypes.has(input.type) && typeof eventId === 'string'
            ? `${input.type}:${eventId}`
            : null;
        const saved = await this.prisma.customerNotification.createMany({
          data: userIds.map((userId) => ({
            userId,
            type: input.type,
            title: input.title,
            body: input.body,
            data: input.data ?? {},
            eventKey,
          })),
          skipDuplicates: true,
        });
        if (saved.count === 0) return;
      }

      const storedTokens = await this.prisma.pushToken.findMany({
        where: {
          userId: { in: userIds },
          app: input.app,
          ...pushScope(input.app),
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
        sound: 'default' as const,
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

        await this.handleTickets(
          chunkTokens,
          tickets,
          receiptTokenIds,
          input.type,
        );
      }

      await this.resolveReceipts(receiptTokenIds, input.type);
    } catch (error) {
      this.logger.error(
        `Push notification dispatch failed for ${input.type}: ${this.toErrorMessage(error)}`,
      );
    }
  }

  async listCustomerNotifications(
    userId: string,
    cursor?: string,
    since?: string,
  ) {
    const createdAt = since ? { gte: new Date(since) } : undefined;
    const where = { userId, ...(createdAt ? { createdAt } : {}) };
    if (
      cursor &&
      !(await this.prisma.customerNotification.findFirst({
        where: { id: cursor, ...where },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException('Invalid notification cursor.');
    }
    const [rows, unreadCount] = await Promise.all([
      this.prisma.customerNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 16,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      this.prisma.customerNotification.count({
        where: { userId, readAt: null },
      }),
    ]);
    const items = rows.slice(0, 15);
    return {
      items,
      unreadCount,
      nextCursor: rows.length > 15 ? items[items.length - 1].id : null,
    };
  }

  async markCustomerNotificationRead(userId: string, id: string) {
    const notification = await this.prisma.customerNotification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!notification) throw new NotFoundException('Notification not found.');
    await this.prisma.customerNotification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async notifyCustomerTripUpdate(tripId: string, type: string) {
    const copy: Record<string, [string, string]> = {
      DRIVER_GOING_TO_PICKUP: [
        'Driver confirmed',
        'Your driver is assigned and heading to pickup.',
      ],
      DRIVER_ARRIVED_PICKUP: [
        'Driver reached pickup',
        'Your driver confirmed arrival at the pickup location.',
      ],
      DRIVER_GOING_TO_DROPOFF: [
        'Driver heading to dropoff',
        'Pickup is complete. Your driver is on the way to the delivery location.',
      ],
      DRIVER_NEAR_DELIVERY: [
        'Driver near dropoff',
        'Your driver is near the delivery location. Please prepare to receive your items.',
      ],
      CUSTOMER_DELIVERY_CONFIRMED: [
        'Delivery confirmed by you',
        'You confirmed successful delivery and authorized release of the driver payment.',
      ],
      TRIP_CANCELLED: [
        'Job cancelled',
        'Your job was cancelled. Open the job to review the cancellation and payment details.',
      ],
    };
    const message = copy[type];
    if (!message)
      throw new BadRequestException('Unknown trip notification type.');
    const trip = await this.prisma.transportRequest.findUnique({
      where: { id: tripId },
      select: { customerId: true },
    });
    if (!trip) return;
    await this.sendToUsers({
      userIds: [trip.customerId],
      app: PushApp.CUSTOMER,
      type,
      title: message[0],
      body: message[1],
      data: { tripId, requestId: tripId },
    });
  }

  async notifyDriversAboutNewTransportRequest(input: {
    drivers: Array<{
      userId: string;
      requestId: string;
      serviceType: string;
      distanceKm: number | null;
    }>;
  }): Promise<void> {
    for (const driver of input.drivers) {
      const distanceLabel =
        driver.distanceKm === null
          ? 'Distance available in app'
          : `${driver.distanceKm.toFixed(1)} km away`;

      await this.sendToUsers({
        userIds: [driver.userId],
        app: PushApp.DRIVER,
        title: 'New transport request',
        body: `${driver.serviceType} · ${distanceLabel}`,
        type: 'NEW_TRANSPORT_REQUEST',
        data: {
          requestId: driver.requestId,
          serviceType: driver.serviceType,
          distanceKm: driver.distanceKm,
        },
      });
    }
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

  async notifyDriverSelected(input: {
    driverUserId: string;
    requestId: string;
    serviceType?: string | null;
  }): Promise<void> {
    const serviceLabel = input.serviceType?.trim() || 'transport request';

    await this.sendToUsers({
      userIds: [input.driverUserId],
      app: PushApp.DRIVER,
      title: 'Customer selected you',
      body: `You were selected for ${serviceLabel}.`,
      type: 'DRIVER_SELECTED',
      data: {
        requestId: input.requestId,
        serviceType: input.serviceType ?? null,
      },
    });
  }

  async notifyDriverApproved(input: {
    driverUserId: string;
    driverName?: string | null;
  }): Promise<void> {
    const normalizedDriverName = input.driverName?.trim();
    const greeting =
      normalizedDriverName && normalizedDriverName.length > 0
        ? `${normalizedDriverName}, your driver account is approved.`
        : 'Your driver account is approved.';

    await this.sendToUsers({
      userIds: [input.driverUserId],
      app: PushApp.DRIVER,
      title: 'Driver account approved',
      body: `${greeting} You can now start receiving transport requests.`,
      type: 'DRIVER_APPROVED',
      data: {
        driverApproved: true,
      },
    });
  }

  async notifyChatMessage(input: {
    recipientUserId: string;
    recipientApp: PushApp;
    chatRoomId: string;
    transportRequestId: string;
    body: string;
    senderNickname?: string;
  }): Promise<void> {
    const preview = input.body.trim().slice(0, 120);

    if (!preview) {
      return;
    }

    await this.sendToUsers({
      userIds: [input.recipientUserId],
      app: input.recipientApp,
      title: input.senderNickname || 'New message',
      body: preview,
      type: 'CHAT_MESSAGE',
      data: {
        chatRoomId: input.chatRoomId,
        transportRequestId: input.transportRequestId,
      },
    });
  }

  async notifyCustomerItemPickedUp(input: {
    customerId: string;
    tripId: string;
    proofPhotoCount: number;
  }): Promise<void> {
    const proofLabel =
      input.proofPhotoCount <= 0
        ? 'pickup proof'
        : input.proofPhotoCount === 1
          ? '1 proof photo'
          : `${input.proofPhotoCount} proof photos`;

    await this.sendToUsers({
      userIds: [input.customerId],
      app: PushApp.CUSTOMER,
      title: 'Pickup confirmed',
      body: `Driver confirmed pickup and uploaded ${proofLabel}.`,
      type: 'ITEM_PICKED_UP',
      data: {
        requestId: input.tripId,
        tripId: input.tripId,
      },
    });
  }

  async notifyCustomerItemDelivered(input: {
    customerId: string;
    tripId: string;
    proofPhotoCount: number;
  }): Promise<void> {
    const proofLabel =
      input.proofPhotoCount <= 0
        ? 'delivery proof'
        : input.proofPhotoCount === 1
          ? '1 proof photo'
          : `${input.proofPhotoCount} proof photos`;

    await this.sendToUsers({
      userIds: [input.customerId],
      app: PushApp.CUSTOMER,
      title: 'Confirm delivery to release payment',
      body: `Your driver marked the service as delivered and uploaded ${proofLabel}. Review the delivery and confirm it was successful to release the driver’s payment.`,
      type: 'ITEM_DELIVERED',
      data: {
        requestId: input.tripId,
        tripId: input.tripId,
      },
    });
  }

  async notifyTripFundsTransferred(input: {
    customerId: string;
    driverUserId: string;
    tripId: string;
    amount: string;
    currency: string;
    stripeTransferId: string;
  }): Promise<void> {
    const normalizedCurrency = input.currency.trim().toUpperCase();
    const amountLabel = `${input.amount} ${normalizedCurrency}`;

    await this.sendToUsers({
      userIds: [input.customerId],
      app: PushApp.CUSTOMER,
      title: 'Trip payout transferred',
      body: `The driver payout for your completed trip was transferred (${amountLabel}).`,
      type: 'TRIP_FUNDS_TRANSFERRED',
      data: {
        requestId: input.tripId,
        tripId: input.tripId,
        stripeTransferId: input.stripeTransferId,
        amount: input.amount,
        currency: normalizedCurrency,
      },
    });

    await this.sendToUsers({
      userIds: [input.driverUserId],
      app: PushApp.DRIVER,
      title: 'Payout transferred',
      body: `Your trip payout of ${amountLabel} was transferred to your Stripe payout account.`,
      type: 'TRIP_FUNDS_TRANSFERRED',
      data: {
        requestId: input.tripId,
        tripId: input.tripId,
        stripeTransferId: input.stripeTransferId,
        amount: input.amount,
        currency: normalizedCurrency,
      },
    });
  }

  async notifyCustomerAdditionalChargeAdded(input: {
    customerId: string;
    requestId: string;
    amount: string;
    currency: string;
    reason: string;
  }): Promise<void> {
    const normalizedCurrency = input.currency.trim().toUpperCase();
    const amountLabel = `${input.amount} ${normalizedCurrency}`;

    await this.sendToUsers({
      userIds: [input.customerId],
      app: PushApp.CUSTOMER,
      title: 'Additional expense added',
      body: `${amountLabel} was added for ${input.reason.trim() || 'your trip'}. Review and approve it in the app.`,
      type: 'ADDITIONAL_CHARGE_ADDED',
      data: {
        requestId: input.requestId,
        tripId: input.requestId,
        amount: input.amount,
        currency: normalizedCurrency,
      },
    });
  }

  async notifyDriverAdditionalChargeApproved(input: {
    driverUserId: string;
    requestId: string;
    amount: string;
    currency: string;
    paymentOption: 'SAVED_CARD' | 'CASH_ON_DELIVERY' | null;
    savedPaymentMethod?: {
      brand: string | null;
      last4: string | null;
    } | null;
  }): Promise<void> {
    const normalizedCurrency = input.currency.trim().toUpperCase();
    const amountLabel = `${input.amount} ${normalizedCurrency}`;
    const paymentLabel =
      input.paymentOption === 'CASH_ON_DELIVERY'
        ? 'by cash on delivery'
        : input.savedPaymentMethod?.last4
          ? `with ${(input.savedPaymentMethod.brand ?? 'card').toUpperCase()} •••• ${input.savedPaymentMethod.last4}`
          : 'with the customer saved card';

    await this.sendToUsers({
      userIds: [input.driverUserId],
      app: PushApp.DRIVER,
      title: 'Additional expense approved',
      body: `The client approved your additional expense of ${amountLabel} ${paymentLabel}.`,
      type: 'ADDITIONAL_CHARGE_APPROVED',
      data: {
        requestId: input.requestId,
        tripId: input.requestId,
        amount: input.amount,
        currency: normalizedCurrency,
        paymentOption: input.paymentOption,
        savedPaymentMethodBrand: input.savedPaymentMethod?.brand ?? null,
        savedPaymentMethodLast4: input.savedPaymentMethod?.last4 ?? null,
      },
    });
  }

  async notifyAdminsAboutDriverReviewSubmission(input: {
    driverProfileId: string;
    driverName?: string | null;
  }): Promise<void> {
    const adminUsers = await this.prisma.user.findMany({
      where: {
        role: UserRole.ADMIN,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (adminUsers.length === 0) {
      return;
    }

    const normalizedDriverName = input.driverName?.trim();
    const payload = this.toBrowserPushPayload({
      type: 'DRIVER_REVIEW_SUBMITTED',
      title: 'New driver review request',
      body:
        normalizedDriverName && normalizedDriverName.length > 0
          ? `${normalizedDriverName} submitted onboarding documents for review.`
          : 'A driver submitted onboarding documents for review.',
      url: '/driver-reviews',
      data: {
        driverProfileId: input.driverProfileId,
      },
    });

    await Promise.allSettled(
      adminUsers.map((admin) =>
        this.webPushProvider.sendToUser(admin.id, payload),
      ),
    );
  }

  toBrowserPushPayload(input: {
    type: string;
    title: string;
    body: string;
    url?: string;
    data?: Record<string, string | number | boolean | null>;
  }): BrowserPushNotificationPayload {
    return {
      id: randomUUID(),
      type: input.type,
      title: input.title,
      body: input.body,
      url: this.toSafeRelativeUrl(input.url),
      tag: input.type.toLowerCase(),
      data: input.data,
    };
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

      if (
        ticket.status === 'ok' &&
        'id' in ticket &&
        typeof ticket.id === 'string'
      ) {
        receiptTokenIds.set(ticket.id, tokenRecord.id);
        return;
      }

      const ticketDetails = 'details' in ticket ? ticket.details : undefined;
      const ticketMessage =
        'message' in ticket && typeof ticket.message === 'string'
          ? ticket.message
          : null;
      const expoError =
        typeof ticketDetails?.error === 'string' ? ticketDetails.error : null;
      if (expoError === EXPO_DEVICE_NOT_REGISTERED) {
        tokensToDeactivate.push(tokenRecord.id);
      }

      this.logger.warn(
        `Expo push ticket error for ${notificationType}: ${ticketMessage ?? expoError ?? 'Unknown error'}`,
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
        const receipts =
          await this.expo.getPushNotificationReceiptsAsync(chunk);
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
        typeof receipt.details?.error === 'string'
          ? receipt.details.error
          : null;
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

  private toSafeRelativeUrl(url?: string): string | undefined {
    if (!url) {
      return '/';
    }

    if (url.startsWith('/')) {
      return url;
    }

    return '/';
  }
}
