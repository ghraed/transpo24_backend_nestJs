import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { bookingConfirmationHealth } from './booking-confirmation-health';
import { PaymentsService } from '../payments/payments.service';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DelayedBookingPaymentsService } from '../payments/delayed-booking-payments.service';
import { CustomerRequestsService } from './customer-requests.service';
import { FurnitureReservationsService } from './furniture-reservations.service';

@Injectable()
export class BookingConfirmationQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BookingConfirmationQueueService.name);
  private queue?: Queue;
  private worker?: Worker<{ requestId?: string }>;
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly bookings: DelayedBookingPaymentsService,
    @Inject(forwardRef(() => CustomerRequestsService))
    private readonly requests: CustomerRequestsService,
    private readonly reservations: FurnitureReservationsService,
    @Optional()
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments?: PaymentsService,
  ) {}

  async onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST')?.trim();
    if (!host) {
      this.logger.warn(
        'Booking confirmation worker unavailable: REDIS_HOST is not configured. New delayed confirmations are rejected.',
      );
      return;
    }
    const connection = {
      host,
      port: Number(this.config.get('REDIS_PORT') ?? 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
    };
    const queueName =
      this.config.get<string>('BOOKING_CONFIRMATION_QUEUE_NAME')?.trim() ||
      'booking-confirmations';
    this.queue = new Queue(queueName, {
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1000,
      },
    });
    this.worker = new Worker<{ requestId?: string }>(
      queueName,
      async (job) => {
        if (job.name === 'sweep') await this.sweep();
        else if (job.data.requestId) await this.process(job.data.requestId);
      },
      { connection, concurrency: 4 },
    );
    this.worker.on('failed', (_job, error) =>
      this.logger.error(`Booking confirmation job failed: ${error.message}`),
    );
    this.worker.on('error', (error) =>
      this.logger.error(`Booking worker: ${error.message}`),
    );
    this.queue.on('error', (error) =>
      this.logger.error(`Booking queue: ${error.message}`),
    );
    try {
      await this.queue.add(
        'sweep',
        {},
        {
          jobId: 'booking-sweep',
          repeat: { every: 15000 },
          removeOnComplete: 10,
          removeOnFail: 100,
        },
      );
      this.bookings.ready = true;
      await this.sweep();
    } catch (error) {
      this.bookings.ready = false;
      this.logger.error(
        `Booking worker startup failed; new delayed bookings are disabled: ${String(error)}`,
      );
      await this.worker.close(true);
      await this.queue.close();
      this.worker = undefined;
      this.queue = undefined;
    }
  }

  async sweep() {
    await this.payments?.recoverAdditionalExpensePayments();
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.paymentHold.findMany({
        where: {
          confirmationStartedAt: { not: null },
          OR: [
            {
              confirmationState: {
                in: [
                  'GRACE_PERIOD',
                  'AUTHORIZING',
                  'ACTION_REQUIRED',
                  'RENEWING',
                  'CANCELLING',
                  'CONFIRMED',
                ],
              },
            },
            { operationKind: { not: null } },
            { previousStripePaymentIntentId: { not: null } },
            {
              confirmationState: 'CANCELLED',
              OR: [
                { confirmationNotifiedState: null },
                { confirmationNotifiedState: { not: 'CANCELLED' } },
              ],
            },
            {
              confirmationState: 'MANUAL_REVIEW',
              OR: [
                { confirmationNotifiedState: null },
                { confirmationNotifiedState: { not: 'MANUAL_REVIEW' } },
              ],
            },
          ],
        },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          requestId: true,
          authorizationDueAt: true,
          confirmationState: true,
          approvalDeadlineAt: true,
          authorizationExpiresAt: true,
          previousStripePaymentIntentId: true,
          operationKind: true,
          updatedAt: true,
        },
        take: 1000,
        orderBy: { id: 'asc' },
      });
      const health = bookingConfirmationHealth(rows);
      if (Object.values(health).some((count) => count > 0))
        this.logger.warn(`Booking payment health: ${JSON.stringify(health)}`);
      for (const row of rows) {
        if (!this.queue) {
          await this.process(row.requestId);
          continue;
        }
        await this.queue.add(
          'confirm',
          { requestId: row.requestId },
          {
            jobId: `booking-${row.requestId}`,
            delay:
              row.confirmationState === 'GRACE_PERIOD'
                ? Math.max(
                    0,
                    (row.authorizationDueAt?.getTime() ?? 0) - Date.now(),
                  )
                : 0,
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      }
      if (rows.length < 1000) break;
      cursor = rows[rows.length - 1].id;
    }
  }

  async process(requestId: string) {
    const hold = await this.bookings.process(requestId);
    if (hold?.confirmationState === 'CONFIRMED') {
      const request = await this.prisma.transportRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      if (request.deferredPaymentState)
        await this.reservations.reconcile(requestId);
      else if (!request.assignedDriverId && request.status !== 'CANCELLED')
        await this.requests.finalizeAcceptedOfferPayment({
          customerId: hold.customerId,
          requestId,
        });
    }
    await this.bookings.notifyState(requestId);
  }

  async onModuleDestroy() {
    this.bookings.ready = false;
    await this.worker?.close();
    await this.queue?.close();
  }
}
