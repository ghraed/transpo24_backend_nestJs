import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { DriverPayoutQueueService } from './driver-payout-queue.service';

jest.mock('bullmq', () => ({ Queue: jest.fn(), Worker: jest.fn() }));

const queueConstructor = Queue as jest.MockedClass<typeof Queue>;
const workerConstructor = Worker as jest.MockedClass<typeof Worker>;

function setup(redisHost?: string) {
  const queue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(null),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const worker = { close: jest.fn().mockResolvedValue(undefined) };
  queueConstructor.mockImplementation(() => queue as never);
  workerConstructor.mockImplementation(() => worker as never);
  const config = {
    get: jest.fn((key: string) =>
      key === 'REDIS_HOST' ? redisHost : undefined,
    ),
  } as unknown as ConfigService;
  const payments = {
    sweepQueuedDriverPayouts: jest.fn().mockResolvedValue(undefined),
    processQueuedDriverPayoutJob: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new DriverPayoutQueueService(config, payments as never),
    queue,
    worker,
    payments,
  };
}

describe('DriverPayoutQueueService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('disables enqueueing when Redis is not configured', async () => {
    const { service } = setup();
    await service.onModuleInit();
    await expect(
      service.enqueueDriverPayout({ tripId: 'trip-1', reason: 'delivery' }),
    ).resolves.toBe(false);
    expect(queueConstructor).not.toHaveBeenCalled();
  });

  it('starts a single worker and recurring sweep, and closes both resources', async () => {
    const { service, queue, worker, payments } = setup('redis.local');
    await service.onModuleInit();
    expect(queueConstructor).toHaveBeenCalledWith(
      'driver-payouts',
      expect.objectContaining({
        connection: expect.objectContaining({
          host: 'redis.local',
          port: 6379,
        }),
      }),
    );
    expect(workerConstructor).toHaveBeenCalledWith(
      'driver-payouts',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'sweep-driver-payouts',
      expect.objectContaining({ reason: 'sweep' }),
      expect.objectContaining({ repeat: { every: 300000 } }),
    );
    const processor = workerConstructor.mock.calls[0][1] as (
      job: unknown,
    ) => Promise<void>;
    await processor({ name: 'sweep-driver-payouts' });
    await processor({
      name: 'process-driver-payout',
      data: { tripId: 'trip-1' },
    });
    expect(payments.sweepQueuedDriverPayouts).toHaveBeenCalledTimes(1);
    expect(payments.processQueuedDriverPayoutJob).toHaveBeenCalledWith(
      'trip-1',
    );
    await service.onModuleDestroy();
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(queue.close).toHaveBeenCalledTimes(1);
  });

  it('deduplicates a waiting payout and replaces a delayed payout only when requested', async () => {
    const { service, queue } = setup('redis.local');
    await service.onModuleInit();
    queue.add.mockClear();
    const existing = {
      getState: jest.fn().mockResolvedValue('waiting'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    queue.getJob.mockResolvedValue(existing);
    await expect(
      service.enqueueDriverPayout({ tripId: 'trip-1', reason: 'delivery' }),
    ).resolves.toBe(true);
    expect(queue.add).not.toHaveBeenCalled();
    existing.getState.mockResolvedValue('delayed');
    await service.enqueueDriverPayout({ tripId: 'trip-1', reason: 'delivery' });
    expect(existing.remove).not.toHaveBeenCalled();
    await service.enqueueDriverPayout({
      tripId: 'trip-1',
      reason: 'admin_manual_retry',
      replaceDelayed: true,
    });
    expect(existing.remove).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'process-driver-payout',
      expect.objectContaining({
        tripId: 'trip-1',
        reason: 'admin_manual_retry',
      }),
      expect.objectContaining({ jobId: 'driver-payout:trip-1' }),
    );
  });

  it('clamps past scheduled jobs to zero delay and schedules future jobs', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T12:00:00Z'));
    try {
      const { service, queue } = setup('redis.local');
      await service.onModuleInit();
      queue.add.mockClear();
      await service.enqueueDriverPayout({
        tripId: 'past',
        reason: 'delivery',
        runAt: new Date('2026-09-29T11:00:00Z'),
      });
      await service.enqueueDriverPayout({
        tripId: 'future',
        reason: 'delivery',
        runAt: new Date('2026-09-29T12:01:00Z'),
      });
      expect(queue.add.mock.calls[0][2]).toEqual(
        expect.objectContaining({ delay: 0 }),
      );
      expect(queue.add.mock.calls[1][2]).toEqual(
        expect.objectContaining({ delay: 60000 }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
