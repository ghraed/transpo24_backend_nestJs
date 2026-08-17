import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ConnectionOptions,
  type Job,
  Queue,
  type QueueOptions,
  Worker,
} from 'bullmq';

import { PaymentsService } from './payments.service';

type DriverPayoutJobReason =
  | 'delivery'
  | 'admin_manual_retry'
  | 'driver_manual_retry'
  | 'sweep'
  | 'automatic_retry';

type DriverPayoutJobData = {
  tripId: string;
  reason: DriverPayoutJobReason;
  requestedAt: string;
};

const DRIVER_PAYOUT_QUEUE_NAME = 'driver-payouts';
const DRIVER_PAYOUT_JOB_NAME = 'process-driver-payout';
const DRIVER_PAYOUT_SWEEP_JOB_NAME = 'sweep-driver-payouts';
const DRIVER_PAYOUT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const DRIVER_PAYOUT_REMOVE_COMPLETED_COUNT = 100;
const DRIVER_PAYOUT_REMOVE_FAILED_COUNT = 200;

@Injectable()
export class DriverPayoutQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriverPayoutQueueService.name);
  private readonly connectionOptions: ConnectionOptions | null;
  private queue: Queue<DriverPayoutJobData> | null = null;
  private worker: Worker<DriverPayoutJobData> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
  ) {
    this.connectionOptions = this.buildRedisConnectionOptions();
  }

  async onModuleInit(): Promise<void> {
    if (!this.connectionOptions) {
      this.logger.warn(
        'Driver payout queue is disabled because REDIS_HOST is not configured.',
      );
      return;
    }

    const queueOptions: QueueOptions = {
      connection: this.connectionOptions,
      defaultJobOptions: {
        removeOnComplete: DRIVER_PAYOUT_REMOVE_COMPLETED_COUNT,
        removeOnFail: DRIVER_PAYOUT_REMOVE_FAILED_COUNT,
      },
    };

    this.queue = new Queue<DriverPayoutJobData>(
      DRIVER_PAYOUT_QUEUE_NAME,
      queueOptions,
    );

    this.worker = new Worker<DriverPayoutJobData>(
      DRIVER_PAYOUT_QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection: this.connectionOptions,
        concurrency: 1,
      },
    );

    await this.ensureSweepJob();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueueDriverPayout(input: {
    tripId: string;
    reason: DriverPayoutJobReason;
    runAt?: Date | null;
    replaceDelayed?: boolean;
  }): Promise<boolean> {
    if (!this.queue) {
      this.logger.warn(
        `Unable to enqueue driver payout for trip ${input.tripId}: queue is not ready.`,
      );
      return false;
    }

    const jobId = this.getTripJobId(input.tripId);
    const existingJob = await this.queue.getJob(jobId);
    const targetDelay = this.resolveDelay(input.runAt);

    if (existingJob) {
      const state = await existingJob.getState();

      if (
        state === 'active' ||
        state === 'waiting' ||
        state === 'waiting-children'
      ) {
        return true;
      }

      if (state === 'delayed') {
        if (!input.replaceDelayed) {
          return true;
        }

        try {
          await existingJob.remove();
        } catch {
          return true;
        }
      } else if (state === 'completed' || state === 'failed') {
        try {
          await existingJob.remove();
        } catch {
          // Ignore removal failures for terminal jobs.
        }
      }
    }

    await this.queue.add(
      DRIVER_PAYOUT_JOB_NAME,
      {
        tripId: input.tripId,
        reason: input.reason,
        requestedAt: new Date().toISOString(),
      },
      {
        jobId,
        delay: targetDelay,
        removeOnComplete: DRIVER_PAYOUT_REMOVE_COMPLETED_COUNT,
        removeOnFail: DRIVER_PAYOUT_REMOVE_FAILED_COUNT,
      },
    );

    return true;
  }

  private async processJob(job: Job<DriverPayoutJobData>): Promise<void> {
    if (job.name === DRIVER_PAYOUT_SWEEP_JOB_NAME) {
      await this.paymentsService.sweepQueuedDriverPayouts();
      return;
    }

    await this.paymentsService.processQueuedDriverPayoutJob(job.data.tripId);
  }

  private async ensureSweepJob(): Promise<void> {
    if (!this.queue) {
      return;
    }

    await this.queue.add(
      DRIVER_PAYOUT_SWEEP_JOB_NAME,
      {
        tripId: 'sweep',
        reason: 'sweep',
        requestedAt: new Date().toISOString(),
      },
      {
        jobId: DRIVER_PAYOUT_SWEEP_JOB_NAME,
        repeat: {
          every: DRIVER_PAYOUT_SWEEP_INTERVAL_MS,
        },
        removeOnComplete: DRIVER_PAYOUT_REMOVE_COMPLETED_COUNT,
        removeOnFail: DRIVER_PAYOUT_REMOVE_FAILED_COUNT,
      },
    );
  }

  private getTripJobId(tripId: string): string {
    return `driver-payout:${tripId}`;
  }

  private resolveDelay(runAt?: Date | null): number {
    if (!runAt) {
      return 0;
    }

    return Math.max(0, runAt.getTime() - Date.now());
  }

  private buildRedisConnectionOptions(): ConnectionOptions | null {
    const host = this.configService.get<string>('REDIS_HOST')?.trim();
    if (!host) {
      return null;
    }

    const port = this.getPositiveInteger(
      this.configService.get<string>('REDIS_PORT'),
      6379,
    );
    const password = this.configService.get<string>('REDIS_PASSWORD')?.trim();

    return {
      host,
      port,
      ...(password ? { password } : {}),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
    };
  }

  private getPositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }
}
