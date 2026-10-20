import { customerOfferPrice } from '../payments/customer-pricing';
import { ChatService } from '../chat/chat.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DriverStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PushApp,
} from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { APPROVED_MATCHING_VEHICLE_WHERE } from '../driver/request-eligibility';
import { CustomerAcceptOfferResponseDto } from './dto/customer-accept-offer-response.dto';
import {
  confirmationWindow,
  reservationSummary,
  shouldDeferTransportPayment,
} from './furniture-reservation-policy';

const include = {
  service: true,
  acceptedOffer: true,
  paymentHold: true,
  assignedDriver: {
    select: {
      userId: true,
      status: true,
      isProfileCompleted: true,
      vehicles: {
        where: APPROVED_MATCHING_VEHICLE_WHERE,
        select: { id: true },
        take: 1,
      },
    },
  },
} satisfies Prisma.TransportRequestInclude;
const notificationMarkers = {
  FURNITURE_RESERVED: 'reservationSelectedNotifiedAt',
  FURNITURE_CONFIRMATION_DUE: 'reservationReminderSentAt',
  FURNITURE_PAYMENT_CONFIRMED: 'reservationPaymentNotifiedAt',
  FURNITURE_RESERVATION_CANCELLED: 'reservationCancellationNotifiedAt',
} as const;
const unpaid = ['WAITING', 'CONFIRMATION_DUE', 'PAYMENT_PENDING'] as const;

@Injectable()
export class FurnitureReservationsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(FurnitureReservationsService.name);
  private queue?: Queue;
  private worker?: Worker;
  private ready = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly chat: ChatService,
  ) {}

  async paymentDue(customerId: string) {
    const now = new Date();
    const rows = await this.prisma.transportRequest.findMany({
      where: {
        customerId,
        status: 'RESERVED',
        service: { key: 'FURNITURE_TRANSPORT' },
        deferredPaymentState: { in: [...unpaid] },
        reservationPaidAt: null,
        confirmationOpensAt: { lte: now },
        paymentDeadlineAt: { gt: now },
      },
      select: {
        id: true,
        scheduledPickupAt: true,
        paymentDeadlineAt: true,
        scheduleTimeZone: true,
        pickupAddress: true,
        dropoffAddress: true,
        acceptedOffer: { select: { id: true, price: true, currency: true } },
        paymentHold: {
          select: { amount: true, customerPlatformFeeAmount: true },
        },
      },
      orderBy: { paymentDeadlineAt: 'asc' },
    });
    return rows
      .filter(
        (row) =>
          row.acceptedOffer && row.scheduledPickupAt && row.paymentDeadlineAt,
      )
      .map((row) => ({
        timeZone: row.scheduleTimeZone ?? 'UTC',
        requestId: row.id,
        offerId: row.acceptedOffer!.id,
        pickupAt: row.scheduledPickupAt!.toISOString(),
        deadlineAt: row.paymentDeadlineAt!.toISOString(),
        pickupAddress: row.pickupAddress,
        dropoffAddress: row.dropoffAddress,
        ...customerOfferPrice(row.acceptedOffer!.price, row.paymentHold),
        currency: row.acceptedOffer!.currency,
      }));
  }

  async onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST');
    if (!host) {
      this.logger.error(
        'Furniture reservations disabled: REDIS_HOST is required.',
      );
      return;
    }
    const connection = {
      host,
      port: Number(this.config.get('REDIS_PORT') ?? 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue('furniture-reservations', {
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1000,
      },
    });
    this.worker = new Worker(
      'furniture-reservations',
      async () => {
        await this.sweep();
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (_job, error) =>
      this.logger.error(`Furniture reservation job failed: ${error.message}`),
    );
    this.worker.on('error', (error) =>
      this.logger.error(`Furniture reservation worker error: ${error.message}`),
    );
    this.queue.on('error', (error) =>
      this.logger.error(`Furniture reservation queue error: ${error.message}`),
    );
    await this.queue.add(
      'sweep',
      {},
      {
        jobId: 'reservation-sweep',
        repeat: { every: 60000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    this.ready = true;
    await this.sweep();
  }
  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM transport_requests WHERE id = ${id} FOR UPDATE`;
  }
  private requireOwner(
    request: { customerId: string } | null,
    customerId: string,
  ) {
    if (!request) throw new NotFoundException('Transport request not found.');
    if (request.customerId !== customerId)
      throw new ForbiddenException(
        'This reservation belongs to another customer.',
      );
  }
  private requireDriver(
    driver: {
      status: DriverStatus;
      isProfileCompleted: boolean;
      vehicles: { id: string }[];
    } | null,
  ) {
    if (
      !driver ||
      driver.status !== DriverStatus.APPROVED ||
      !driver.isProfileCompleted ||
      !driver.vehicles.length
    )
      throw new ConflictException(
        'Reserved driver is no longer eligible. Cancel this reservation and choose another driver.',
      );
  }

  async tryReserve(input: {
    customerId: string;
    requestId: string;
    offerId: string;
    supportsDeferredFurniture?: boolean;
    supportsDeferredVehicle?: boolean;
  }): Promise<CustomerAcceptOfferResponseDto | null> {
    const initial = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      include: { service: true },
    });
    this.requireOwner(initial, input.customerId);
    if (initial!.deferredPaymentState) {
      if (initial!.acceptedOfferId !== input.offerId)
        throw new ConflictException('A different offer is already reserved.');
      return this.response(initial!.id);
    }
    if (
      !input.supportsDeferredFurniture ||
      !shouldDeferTransportPayment(
        initial!.service.key,
        initial!.scheduledPickupAt,
        initial!.scheduleTimeZone,
      )
    )
      return null;
    if (
      !this.ready ||
      this.config.get<string>('FURNITURE_RESERVATIONS_ENABLED') !== 'true'
    )
      throw new ConflictException(
        'Scheduled transport reservations are temporarily unavailable. Please retry later.',
      );
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.requestId);
      const request = await tx.transportRequest.findUniqueOrThrow({
        where: { id: input.requestId },
        include: { service: true },
      });
      this.requireOwner(request, input.customerId);
      if (
        request.deferredPaymentState &&
        request.acceptedOfferId === input.offerId
      )
        return;
      if (
        !['PENDING_QUOTES', 'QUOTED'].includes(request.status) ||
        request.acceptedOfferId ||
        request.assignedDriverId ||
        request.paymentHoldId
      )
        throw new ConflictException(
          'This request is no longer available for reservation.',
        );
      if (
        !shouldDeferTransportPayment(
          request.service.key,
          request.scheduledPickupAt,
          request.scheduleTimeZone,
        )
      )
        throw new ConflictException(
          'Pickup is now within five days. Refresh the request to pay now.',
        );
      const offer = await tx.driverOffer.findUnique({
        where: { id: input.offerId },
        include: { driver: { select: include.assignedDriver.select } },
      });
      if (
        !offer ||
        offer.requestId !== request.id ||
        offer.status !== 'PENDING'
      )
        throw new ConflictException('Offer is no longer available.');
      this.requireDriver(offer.driver);
      const now = new Date();
      await tx.transportRequest.update({
        where: { id: request.id },
        data: {
          status: 'RESERVED',
          deferredPaymentState: 'WAITING',
          acceptedOfferId: offer.id,
          assignedDriverId: offer.driverId,
          acceptedAt: now,
          ...confirmationWindow(request.scheduledPickupAt!),
        },
      });
      await tx.driverOffer.update({
        where: { id: offer.id },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      await tx.driverOffer.updateMany({
        where: {
          requestId: request.id,
          id: { not: offer.id },
          status: 'PENDING',
        },
        data: { status: 'REJECTED', rejectedAt: now },
      });
      await this.chat.ensureRoomForAcceptedOffer(tx, {
        transportRequestId: request.id,
        clientId: request.customerId,
        driverId: offer.driverId,
        acceptedOfferId: offer.id,
      });
    });
    // The persisted sweep is authoritative; delayed jobs only reduce latency.
    const reserved = await this.prisma.transportRequest.findUniqueOrThrow({
      where: { id: input.requestId },
    });
    for (const date of [
      reserved.confirmationOpensAt!,
      reserved.paymentDeadlineAt!,
    ]) {
      await this.queue
        ?.add(
          'due',
          {},
          {
            jobId: `${reserved.id}-${date.getTime()}`,
            delay: Math.max(0, date.getTime() - Date.now()),
            removeOnComplete: true,
          },
        )
        .catch((error) =>
          this.logger.error(
            `Failed to schedule reservation ${reserved.id}: ${String(error)}`,
          ),
        );
    }
    try {
      await this.notifyOnce(input.requestId, 'FURNITURE_RESERVED');
    } catch (error) {
      this.logger.error(
        `Reservation notification queued for retry: ${String(error)}`,
      );
    }

    return this.response(input.requestId);
  }

  async confirm(input: {
    customerId: string;
    requestId: string;
    confirm: boolean;
    paymentMethod?: PaymentMethod;
    stripePaymentMethodId?: string;
  }): Promise<CustomerAcceptOfferResponseDto> {
    if (!input.confirm || !input.paymentMethod)
      throw new BadRequestException(
        'Confirm pickup and select a payment method.',
      );
    // Refresh Stripe outside the row lock. A webhook can take the same lock.
    const initial = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      include,
    });
    this.requireOwner(initial, input.customerId);
    if (!initial!.deferredPaymentState)
      throw new ConflictException(
        'This request is not a deferred reservation.',
      );
    if (initial!.paymentHold) await this.payments.getRequestPayment(input);
    await this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, input.requestId);
        const request = await tx.transportRequest.findUniqueOrThrow({
          where: { id: input.requestId },
          include,
        });
        this.requireOwner(request, input.customerId);
        if (request.deferredPaymentState === 'PAID') return;
        if (!reservationSummary(request)?.canConfirmAndPay)
          throw new ConflictException(
            'Confirmation is available from 48 until 24 hours before pickup.',
          );
        this.requireDriver(request.assignedDriver);
        if (
          !request.acceptedOffer ||
          request.acceptedOffer.status !== 'ACCEPTED'
        )
          throw new ConflictException('Reserved offer is unavailable.');
        if (request.paymentHold) {
          // Reuse the same intent after authentication cancellation/decline. Never create a second live intent.
          if (request.paymentHold.paymentMethod !== input.paymentMethod)
            throw new ConflictException(
              'Continue with the payment method already selected for this reservation.',
            );
          if (
            ['PAYMENT_CANCELLED', 'PAYMENT_RELEASED'].includes(
              request.paymentHold.status,
            )
          )
            throw new ConflictException(
              'This payment was cancelled. Cancel the reservation and book again.',
            );
          await tx.paymentHold.update({
            where: { id: request.paymentHold.id },
            data: {
              status:
                request.paymentHold.status === 'PAYMENT_FAILED'
                  ? 'PAYMENT_HOLD_PENDING'
                  : request.paymentHold.status,
            },
          });
        } else {
          await this.payments.createHoldForAcceptedOffer(tx, {
            customerId: request.customerId,
            requestId: request.id,
            acceptedOfferId: request.acceptedOffer.id,
            driverId: request.acceptedOffer.driverId,
            amount: request.acceptedOffer.price,
            currency: request.acceptedOffer.currency,
            paymentMethod: input.paymentMethod!,
            stripePaymentMethodId: undefined,
          });
        }
        await tx.transportRequest.update({
          where: { id: request.id },
          data: {
            deferredPaymentState: 'PAYMENT_PENDING',
            pickupConfirmedAt: new Date(),
          },
        });
      },
      { timeout: 30000 },
    );
    await this.reconcile(input.requestId);
    return this.response(input.requestId);
  }

  async finalize(
    customerId: string,
    id: string,
  ): Promise<CustomerAcceptOfferResponseDto | null> {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id },
      select: { customerId: true, deferredPaymentState: true },
    });
    if (!request?.deferredPaymentState) return null;
    this.requireOwner(request, customerId);
    await this.reconcile(id);
    return this.response(id);
  }

  async reconcile(id: string) {
    let request = await this.prisma.transportRequest.findUnique({
      where: { id },
      include,
    });
    if (
      !request?.deferredPaymentState ||
      request.deferredPaymentState === 'PAID'
    )
      return;
    if (
      request.paymentHold &&
      request.paymentHold.status !== 'PAYMENT_REFUNDED'
    ) {
      await this.payments.getRequestPayment({
        customerId: request.customerId,
        requestId: id,
      });
    }
    await this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, id);
        const row = await tx.transportRequest.findUniqueOrThrow({
          where: { id },
          include,
        });
        if (row.deferredPaymentState === 'PAID') return;
        const captured =
          row.paymentHold?.status === PaymentStatus.PAYMENT_CAPTURED;
        const expired =
          !row.paymentDeadlineAt || new Date() >= row.paymentDeadlineAt;
        if (
          row.status === 'RESERVED' &&
          captured &&
          (!expired ||
            (row.paymentHold?.capturedAt &&
              row.paymentDeadlineAt &&
              row.paymentHold.capturedAt < row.paymentDeadlineAt)) &&
          row.pickupConfirmedAt
        ) {
          if (
            !row.assignedDriver ||
            row.assignedDriver.status !== DriverStatus.APPROVED ||
            !row.assignedDriver.isProfileCompleted ||
            !row.assignedDriver.vehicles.length
          ) {
            await this.expireTx(tx, id, 'CANCELLED');
            return;
          }
          await tx.transportRequest.update({
            where: { id },
            data: {
              deferredPaymentState: 'PAID',
              status: 'DRIVER_ASSIGNED',
              reservationPaidAt: row.paymentHold?.capturedAt ?? new Date(),
            },
          });
        } else if (row.status === 'RESERVED' && expired) {
          await this.expireTx(tx, id, 'EXPIRED');
        }
      },
      { timeout: 30000 },
    );
    request = await this.prisma.transportRequest.findUniqueOrThrow({
      where: { id },
      include,
    });
    if (
      request.status === 'CANCELLED' &&
      request.paymentHold &&
      !request.reservationRefundedAt
    ) {
      if (request.paymentHold.status === 'PAYMENT_CAPTURED') {
        await this.payments.refundUnpaidReservation({
          customerId: request.customerId,
          requestId: id,
        });
        await this.prisma.transportRequest.update({
          where: { id },
          data: { reservationRefundedAt: new Date() },
        });
      } else if (
        !['PAYMENT_CANCELLED', 'PAYMENT_RELEASED', 'PAYMENT_REFUNDED'].includes(
          request.paymentHold.status,
        )
      ) {
        await this.payments.cancelRequestPayment({
          customerId: request.customerId,
          requestId: id,
        });
      }
    }
  }
  private async expireTx(
    tx: Prisma.TransactionClient,
    id: string,
    state: 'EXPIRED' | 'CANCELLED',
  ) {
    await tx.transportRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        deferredPaymentState: state,
        assignedDriverId: null,
      },
    });
    await tx.driverOffer.updateMany({
      where: { requestId: id, status: 'ACCEPTED' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }
  async cancel(customerId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const request = await tx.transportRequest.findUnique({
        where: { id },
        include: { paymentHold: true },
      });
      this.requireOwner(request, customerId);
      if (
        !request!.deferredPaymentState ||
        request!.deferredPaymentState === 'PAID'
      )
        throw new ConflictException('Use the paid trip cancellation flow.');
      if (request!.status === 'CANCELLED') return;
      if (request!.paymentHold?.status === 'PAYMENT_CAPTURED')
        throw new ConflictException(
          'Payment succeeded. Refresh the booking before cancelling.',
        );
      await this.expireTx(tx, id, 'CANCELLED');
    });
    await this.reconcile(id);
    await this.notifyOnce(id, 'FURNITURE_RESERVATION_CANCELLED');
    return { requestStatus: 'CANCELLED' as const };
  }

  async sweep() {
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.transportRequest.findMany({
        where: {
          OR: [
            {
              deferredPaymentState: { in: [...unpaid] },
              OR: [
                { confirmationOpensAt: { lte: new Date() } },
                { reservationSelectedNotifiedAt: null },
              ],
            },
            {
              deferredPaymentState: 'PAID',
              reservationPaymentNotifiedAt: null,
            },
            {
              deferredPaymentState: { in: ['EXPIRED', 'CANCELLED'] },
              OR: [
                { reservationCancellationNotifiedAt: null },
                {
                  paymentHold: {
                    status: {
                      in: [
                        'PAYMENT_HOLD_PENDING',
                        'PAYMENT_FAILED',
                        'PAYMENT_CAPTURED',
                      ],
                    },
                  },
                  reservationRefundedAt: null,
                },
              ],
            },
          ],
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 200,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const { id } of rows) {
        try {
          await this.reconcile(id);
          const request = await this.prisma.transportRequest.findUniqueOrThrow({
            where: { id },
          });
          if (request.status === 'CANCELLED') {
            await this.notifyOnce(id, 'FURNITURE_RESERVATION_CANCELLED');
          } else if (request.deferredPaymentState === 'PAID') {
            await this.notifyOnce(id, 'FURNITURE_PAYMENT_CONFIRMED');
          } else if (request.status === 'RESERVED') {
            await this.notifyOnce(id, 'FURNITURE_RESERVED');
            if (
              request.confirmationOpensAt &&
              new Date() >= request.confirmationOpensAt
            )
              await this.notifyOnce(id, 'FURNITURE_CONFIRMATION_DUE');
          }
        } catch (error) {
          this.logger.error(
            `Furniture reservation ${id} requires retry: ${String(error)}`,
          );
        }
      }
      if (rows.length < 200) return;
      cursor = rows[rows.length - 1].id;
    }
  }

  private async notifyOnce(id: string, type: keyof typeof notificationMarkers) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, id);
        const row = await tx.transportRequest.findUniqueOrThrow({
          where: { id },
        });
        const marker = notificationMarkers[type];
        if (row[marker]) return;
        if (
          type === 'FURNITURE_RESERVATION_CANCELLED' &&
          row.status !== 'CANCELLED'
        )
          return;
        if (
          type === 'FURNITURE_PAYMENT_CONFIRMED' &&
          row.deferredPaymentState !== 'PAID'
        )
          return;
        if (
          (type === 'FURNITURE_RESERVED' ||
            type === 'FURNITURE_CONFIRMATION_DUE') &&
          row.status !== 'RESERVED'
        )
          return;
        if (
          type === 'FURNITURE_CONFIRMATION_DUE' &&
          !reservationSummary(row)?.canConfirmAndPay
        )
          return;
        await this.notify(id, type);
        await tx.transportRequest.update({
          where: { id },
          data: {
            [marker]: new Date(),
            ...(type === 'FURNITURE_CONFIRMATION_DUE' &&
            row.deferredPaymentState === 'WAITING'
              ? { deferredPaymentState: 'CONFIRMATION_DUE' }
              : {}),
          },
        });
      },
      { timeout: 30000 },
    );
  }

  private async notify(id: string, type: string) {
    const request = await this.prisma.transportRequest.findUniqueOrThrow({
      where: { id },
      include: {
        service: { select: { key: true } },
        acceptedOffer: { include: { driver: { select: { userId: true } } } },
      },
    });
    const vehicle = request.service.key === 'VEHICLE_TRANSPORT';
    const serviceName = vehicle ? 'Vehicle' : 'Furniture';
    const eventType = vehicle ? type.replace('FURNITURE_', 'VEHICLE_') : type;
    const cancelled = type === 'FURNITURE_RESERVATION_CANCELLED';
    const paid = type === 'FURNITURE_PAYMENT_CONFIRMED';
    const title = paid
      ? `${serviceName} pickup confirmed and paid`
      : cancelled
        ? `${serviceName} reservation cancelled`
        : type === 'FURNITURE_RESERVED'
          ? `${serviceName} driver reserved`
          : `Confirm ${serviceName.toLowerCase()} pickup and pay`;
    const deadline = request.paymentDeadlineAt
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone: request.scheduleTimeZone ?? 'UTC',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZoneName: 'short',
        }).format(request.paymentDeadlineAt)
      : '';
    const body = paid
      ? 'The customer confirmed and paid. The scheduled pickup is ready. Driver payout follows successful delivery confirmation.'
      : cancelled
        ? 'The unpaid reservation has been cancelled. No cancellation fee applies.'
        : type === 'FURNITURE_RESERVED'
          ? 'Your driver and agreed price are reserved. Payment opens 48 hours before pickup.'
          : `Confirm pickup and pay before ${deadline} to keep your driver reservation.`;
    await this.notifications.sendToUsers({
      userIds: [request.customerId],
      app: PushApp.CUSTOMER,
      title,
      body,
      type: eventType,
      data: {
        requestId: id,
        tripId: id,
        ...(type === 'FURNITURE_CONFIRMATION_DUE'
          ? {
              pickupAt: request.scheduledPickupAt?.toISOString(),
              deadlineAt: request.paymentDeadlineAt?.toISOString(),
            }
          : {}),
      },
      retryPersistedEvent: true,
    });
    if (
      type !== 'FURNITURE_CONFIRMATION_DUE' &&
      request.acceptedOffer?.driver.userId
    )
      await this.notifications.sendToUsers({
        userIds: [request.acceptedOffer.driver.userId],
        app: PushApp.DRIVER,
        title,
        body,
        type: eventType,
        data: {
          requestId: id,
          tripId: id,
          ...(type === 'FURNITURE_CONFIRMATION_DUE'
            ? {
                pickupAt: request.scheduledPickupAt?.toISOString(),
                deadlineAt: request.paymentDeadlineAt?.toISOString(),
              }
            : {}),
        },
        retryPersistedEvent: true,
      });
  }
  private async response(id: string): Promise<CustomerAcceptOfferResponseDto> {
    const row = await this.prisma.transportRequest.findUniqueOrThrow({
      where: { id },
      include,
    });
    const offer = row.acceptedOffer;
    if (!offer) throw new ConflictException('Reserved offer not found.');
    const payment = row.paymentHold
      ? await this.payments.getRequestPayment({
          customerId: row.customerId,
          requestId: id,
        })
      : null;
    return {
      request: {
        id,
        status: row.status,
        assignedDriverId: row.assignedDriverId,
        acceptedOfferId: row.acceptedOfferId,
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
      },
      acceptedOffer: {
        ...offer,
        ...customerOfferPrice(offer.price, row.paymentHold),
        estimatedPickupAt: offer.estimatedPickupAt?.toISOString() ?? null,
        estimatedDeliveryAt: offer.estimatedDeliveryAt?.toISOString() ?? null,
        acceptedAt: offer.acceptedAt?.toISOString() ?? null,
        createdAt: offer.createdAt.toISOString(),
      },
      payment,
      reservation: reservationSummary(row),
      rejectedOffersCount: 0,
      nextStep:
        row.deferredPaymentState === 'PAID'
          ? 'TRACK_REQUEST'
          : row.status === 'RESERVED' && row.paymentHold
            ? 'CONFIRM_PAYMENT'
            : 'RESERVATION_CONFIRMED',
    };
  }
}
