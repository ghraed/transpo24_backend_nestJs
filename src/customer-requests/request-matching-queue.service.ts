import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { CustomerRequestsService } from './customer-requests.service';

type MatchJob = { requestId: string };
@Injectable()
export class RequestMatchingQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RequestMatchingQueueService.name);
  private queue?: Queue<MatchJob>;
  private worker?: Worker<MatchJob>;
  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => CustomerRequestsService))
    private readonly requests: CustomerRequestsService,
  ) {}
  onModuleInit() {
    if (this.config.get<string>('MATCHING_QUEUE_ENABLED') !== 'true') return;
    const host = this.config.get<string>('REDIS_HOST')?.trim();
    if (!host) throw new Error('MATCHING_QUEUE_ENABLED requires REDIS_HOST');
    const port = Number(this.config.get<string>('REDIS_PORT') || 6379);
    const password =
      this.config.get<string>('REDIS_PASSWORD')?.trim() || undefined;
    const connection = { host, port, password, connectTimeout: 1000 };
    this.queue = new Queue<MatchJob>('request-matching', {
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
    this.worker = new Worker<MatchJob>(
      'request-matching',
      async (job) => this.process(job.data),
      {
        connection: { ...connection, maxRetriesPerRequest: null },
        concurrency: 2,
      },
    );
    this.queue.on('error', (error) => this.logger.error(error.message));
    this.worker.on('error', (error) => this.logger.error(error.message));
  }
  async enqueue(requestId: string) {
    if (!this.queue) return false;
    try {
      await this.queue.add('match-request', { requestId });
      return true;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Matching queue unavailable',
      );
      return false;
    }
  }
  // Queue input is an ID only; publication, geography, permissions and policy are reloaded.
  async process(data: MatchJob) {
    await this.requests.matchPublishedRequest(data.requestId);
  }
  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
