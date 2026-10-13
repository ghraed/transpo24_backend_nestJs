import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Queue, Worker } from 'bullmq';
import sharp from 'sharp';
import { RegistrationJobStore } from '../src/vehicles/registration/registration-job.store';
import { RegistrationQueueService } from '../src/vehicles/registration/registration-queue.service';
import { RegistrationService } from '../src/vehicles/registration/registration.service';
import { QwenRegistrationProvider } from '../src/vehicles/registration/qwen-registration.provider';
import { syntheticExtraction } from '../src/vehicles/registration/registration.fixtures';
import { validateExtraction } from '../src/vehicles/registration/registration.schema';
import { scanError } from '../src/vehicles/registration/registration.errors';

const redisDescribe = process.env.REGISTRATION_TEST_REDIS_PORT
  ? describe
  : describe.skip;
redisDescribe('registration queue with real Redis', () => {
  let directory: string;
  let prefix: string;
  let stores: RegistrationJobStore[];
  let workers: RegistrationQueueService[];
  let control: Queue<{ jobId: string }>;
  let fixture: Buffer;
  let provider: { assertConfigured: jest.Mock; extract: jest.Mock };
  let service: RegistrationService;
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const eventually = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 200; i++) {
      if (await check()) return;
      await sleep(25);
    }
    throw new Error('Condition did not become true');
  };

  beforeAll(async () => {
    fixture = await sharp({
      create: { width: 1024, height: 512, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    Logger.overrideLogger(false);
  });
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'registration-queue-test-'));
    prefix = `test-${randomUUID()}`;
    stores = [];
    workers = [];
    provider = {
      assertConfigured: jest.fn(),
      extract: jest.fn(async () =>
        validateExtraction(syntheticExtraction(), 1),
      ),
    };
    service = new RegistrationService(
      provider as unknown as QwenRegistrationProvider,
    );
    const config = new ConfigService({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: process.env.REGISTRATION_TEST_REDIS_PORT,
      REGISTRATION_QUEUE_PREFIX: prefix,
      REGISTRATION_STORAGE_DIR: directory,
    });
    for (let i = 0; i < 2; i++) {
      const store = new RegistrationJobStore(config);
      const worker = new RegistrationQueueService(
        config,
        store,
        service,
        provider as unknown as QwenRegistrationProvider,
      );
      stores.push(store);
      workers.push(worker);
      await worker.onModuleInit();
      await store.ready();
    }
    control = new Queue<{ jobId: string }>('registration-extractions', {
      prefix,
      connection: {
        host: '127.0.0.1',
        port: Number(process.env.REGISTRATION_TEST_REDIS_PORT),
      },
    });
  });
  afterEach(async () => {
    await Promise.all(workers.map((worker) => worker.onModuleDestroy()));
    await control.close();
    const redis = await stores[1].ready();
    const keys = await redis.keys(`${prefix}:*`); // Unique test namespace, never FLUSHDB.
    if (keys.length) await redis.del(...keys);
    for (const store of stores) store.onApplicationShutdown();
    await rm(directory, { recursive: true, force: true });
  });
  const submit = async (owner: string, worker = workers[0]) => {
    const record = await worker.reserve(owner);
    const name = randomUUID();
    const path = join(worker.directory(record.jobId), name);
    await writeFile(path, fixture, { mode: 0o600 });
    return worker.enqueue(record.jobId, [
      { filename: name, path } as Express.Multer.File,
    ]);
  };

  it('reserves capacity atomically across API instances before any image upload', async () => {
    const reservations = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) =>
        workers[index % 2].reserve(`owner-${index}`),
      ),
    );
    const accepted = reservations.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<RegistrationQueueService['reserve']>>
      > => result.status === 'fulfilled',
    );
    expect(accepted).toHaveLength(20);
    for (const result of reservations)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({
          response: { code: 'REGISTRATION_QUEUE_FULL' },
        });
    expect(await readdir(directory)).toHaveLength(20);
    expect(provider.extract).not.toHaveBeenCalled();
    await Promise.all(
      accepted.map((result) => workers[0].abandon(result.value.jobId)),
    );
    expect(await stores[0].outstanding()).toEqual([]);
    expect(await readdir(directory)).toEqual([]);
  });

  it('allows only one outstanding scan per owner and shares scan/poll limits', async () => {
    const outcomes = await Promise.allSettled([
      workers[0].reserve('same'),
      workers[1].reserve('same'),
    ]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.find((result) => result.status === 'rejected'),
    ).toMatchObject({
      reason: { response: { code: 'REGISTRATION_ALREADY_PENDING' } },
    });
    for (let i = 0; i < 5; i++)
      await stores[i % 2].limit('limited', 'minute', 5, 60);
    await expect(
      stores[1].limit('limited', 'minute', 5, 60),
    ).rejects.toMatchObject({ response: { code: 'REGISTRATION_RATE_LIMIT' } });
    await stores[0].limit('limited', 'poll', 60, 60);
    await stores[0].limit('separate', 'minute', 5, 60);
  });

  it('limits a burst to one active extraction across two workers and clears files', async () => {
    await control.pause();
    let active = 0;
    let maximum = 0;
    const waits: number[] = [];
    const memoryBefore = process.memoryUsage().rss;
    provider.extract.mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        await sleep(30);
        return validateExtraction(syntheticExtraction(), 1);
      } finally {
        active--;
      }
    });
    const processing = jest.spyOn(service, 'extract');
    const submittedAt = Date.now();
    const jobs = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        submit(`burst-${index}`, workers[index % 2]),
      ),
    );
    const bullJobs = await control.getJobs(['waiting', 'paused']);
    expect(bullJobs).toHaveLength(20);
    for (const job of bullJobs)
      expect(Object.keys(job.data)).toEqual(['jobId']);
    await control.resume();
    await eventually(async () => {
      const states = await Promise.all(
        jobs.map((job, index) =>
          workers[1].status(`burst-${index}`, job.jobId),
        ),
      );
      return states.every((state) => state.status === 'completed');
    });
    await workers[0].sweep();
    expect(maximum).toBe(1);
    expect(processing).toHaveBeenCalledTimes(20);
    for (const [files] of processing.mock.calls)
      expect(
        files.every((file) => !file.buffer?.length && Boolean(file.path)),
      ).toBe(true);
    expect(await stores[0].outstanding()).toEqual([]);
    expect(await readdir(directory)).toEqual([]);
    waits.push(Date.now() - submittedAt);
    console.info(
      JSON.stringify({
        registrationBurst: {
          submitted: 20,
          workers: 2,
          maximumActive: maximum,
          completedInMs: waits[0],
          rssDeltaBytes: process.memoryUsage().rss - memoryBefore,
          uploadedBytes: fixture.length * 20,
          remainingFiles: 0,
        },
      }),
    );
    processing.mockRestore();
  });

  it('cancels queued work without making an AI call and cancellation is idempotent', async () => {
    await control.pause();
    const job = await submit('cancel-queued');
    await workers[1].cancel('cancel-queued', job.jobId);
    await workers[0].cancel('cancel-queued', job.jobId);
    await control.resume();
    expect((await workers[0].status('cancel-queued', job.jobId)).status).toBe(
      'cancelled',
    );
    expect(provider.extract).not.toHaveBeenCalled();
    expect(await readdir(directory)).toEqual([]);
  });

  it('retains the slot until cancelled active work stops, including cross-instance cancellation', async () => {
    let stopped: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    provider.extract.mockImplementationOnce(async (_images, currentSignal) => {
      signal = currentSignal;
      await new Promise<void>((resolve) => {
        stopped = resolve;
      });
      return validateExtraction(syntheticExtraction(), 1);
    });
    const first = await submit('cancel-active');
    await eventually(async () => Boolean(stopped));
    await workers[1].cancel('cancel-active', first.jobId);
    const second = await submit('after-cancel');
    await eventually(async () => signal?.aborted === true);
    expect(provider.extract).toHaveBeenCalledTimes(1);
    expect(await stores[0].outstanding()).toHaveLength(2);
    stopped!();
    await eventually(
      async () =>
        (await workers[1].status('after-cancel', second.jobId)).status ===
        'completed',
    );
    const cancelled = await workers[0].status('cancel-active', first.jobId);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.result).toBeUndefined();
  });

  it('expires work without a client polling, removes orphans and releases capacity', async () => {
    await control.pause();
    const job = await submit('expired');
    await stores[0].update(job.jobId, ['queued'], {
      expiresAt: Date.now() - 1,
    });
    await workers[1].sweep();
    expect((await workers[0].status('expired', job.jobId)).status).toBe(
      'expired',
    );
    expect(await stores[0].outstanding()).toEqual([]);
    expect(await readdir(directory)).toEqual([]);
    expect(provider.extract).not.toHaveBeenCalled();
    const record = await workers[0].reserve('orphan');
    await stores[0].redis!.del(stores[0].key(record.jobId));
    // Lost Redis state cannot retain a public or permanent upload.
    await stores[0].redis!.del(
      `${prefix}:outstanding`,
      `${prefix}:owner:orphan`,
    );
    await utimes(workers[0].directory(record.jobId), new Date(0), new Date(0));
    await workers[1].sweep();
    expect(await readdir(directory)).toEqual([]);
  });

  it('recovers a processing job with retained files and fails safely when files are lost', async () => {
    await control.pause();
    const recovering = await submit('recovering');
    await stores[0].update(recovering.jobId, ['queued'], {
      status: 'processing',
    });
    const missing = await submit('missing-files');
    await rm(workers[0].directory(missing.jobId), { recursive: true });
    await control.resume();
    await eventually(
      async () =>
        (await workers[1].status('recovering', recovering.jobId)).status ===
        'completed',
    );
    await eventually(
      async () =>
        (await workers[1].status('missing-files', missing.jobId)).status ===
        'failed',
    );
    expect(
      (await workers[0].status('missing-files', missing.jobId)).error?.code,
    ).toBe('REGISTRATION_UNAVAILABLE');
    expect(provider.extract).toHaveBeenCalledTimes(1);
  });

  it('fails safely with Redis unavailable and never calls the extraction provider', async () => {
    await stores[0].ready();
    const ended = new Promise<void>((resolve) =>
      stores[0].redis!.once('end', resolve),
    );
    stores[0].redis!.disconnect();
    await ended;
    await expect(workers[0].reserve('outage')).rejects.toMatchObject({
      response: { code: 'REGISTRATION_UNAVAILABLE' },
    });
    expect(provider.extract).not.toHaveBeenCalled();
    await stores[0].redis!.connect();
    const recovered = await submit('redis-recovered');
    await eventually(
      async () =>
        (await workers[0].status('redis-recovered', recovered.jobId)).status ===
        'completed',
    );
  });

  it('recovers a real expired BullMQ lock after a worker stops renewing it', async () => {
    const liveWorkers = workers.map(
      (instance) =>
        (instance as unknown as { worker: Worker<{ jobId: string }> }).worker,
    );
    await Promise.all(liveWorkers.map((worker) => worker.pause()));
    const job = await submit('stalled-worker');
    const abandonedWorker = new Worker<{ jobId: string }>(
      'registration-extractions',
      null,
      {
        prefix,
        connection: {
          host: '127.0.0.1',
          port: Number(process.env.REGISTRATION_TEST_REDIS_PORT),
        },
        autorun: false,
        lockDuration: 50,
        stalledInterval: 50,
        maxStalledCount: 1,
      },
    );
    const claimed = await abandonedWorker.getNextJob('abandoned-token', {
      block: false,
    });
    await abandonedWorker.close(true);
    expect(claimed?.id).toBe(job.jobId);
    await stores[0].update(job.jobId, ['queued'], { status: 'processing' });
    const recovery = new Worker<{ jobId: string }>(
      'registration-extractions',
      null,
      {
        prefix,
        connection: {
          host: '127.0.0.1',
          port: Number(process.env.REGISTRATION_TEST_REDIS_PORT),
        },
        autorun: false,
        stalledInterval: 50,
        maxStalledCount: 1,
      },
    );
    try {
      await eventually(async () => {
        await stores[0].redis!.del(
          `${prefix}:registration-extractions:stalled-check`,
        );
        await recovery.scripts.moveStalledJobsToWait();
        return (
          (await control.getJob(job.jobId))
            ?.getState()
            .then((state) => state === 'waiting') ?? false
        );
      });
      for (const worker of liveWorkers) worker.resume();
      await eventually(
        async () =>
          (await workers[1].status('stalled-worker', job.jobId)).status ===
          'completed',
      );
      expect(provider.extract).toHaveBeenCalledTimes(1);
    } finally {
      await recovery.close(true);
    }
  });

  it('preserves safe provider errors without adding job retries and bounds result retention', async () => {
    provider.extract.mockRejectedValueOnce(
      scanError('REGISTRATION_RATE_LIMIT', 429),
    );
    const job = await submit('provider-error');
    await eventually(
      async () =>
        (await workers[0].status('provider-error', job.jobId)).status ===
        'failed',
    );
    expect(
      (await workers[0].status('provider-error', job.jobId)).error?.code,
    ).toBe('REGISTRATION_RATE_LIMIT');
    expect(provider.extract).toHaveBeenCalledTimes(1);
    await workers[0].sweep();
    const ttl = await stores[0].redis!.ttl(stores[0].key(job.jobId));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('expires active work and aborts the provider without any client polling', async () => {
    const config = new ConfigService({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: process.env.REGISTRATION_TEST_REDIS_PORT,
      REGISTRATION_QUEUE_PREFIX: prefix,
      REGISTRATION_STORAGE_DIR: directory,
      REGISTRATION_JOB_TIMEOUT_MS: 500,
    });
    const store = new RegistrationJobStore(config);
    const worker = new RegistrationQueueService(
      config,
      store,
      service,
      provider as unknown as QwenRegistrationProvider,
    );
    stores.push(store);
    workers.push(worker);
    await worker.onModuleInit();
    let aborted = false;
    provider.extract.mockImplementationOnce(
      async (_images, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(scanError('REGISTRATION_CANCELLED', 400));
            },
            { once: true },
          );
        }),
    );
    const job = await submit('active-expiration', worker);
    await eventually(async () => (await store.outstanding()).length === 0);
    expect(aborted).toBe(true);
    expect((await worker.status('active-expiration', job.jobId)).status).toBe(
      'expired',
    );
    expect(await readdir(directory)).toEqual([]);
  });

  it('aborts active work and removes files before graceful worker shutdown finishes', async () => {
    let aborted = false;
    provider.extract.mockImplementationOnce(
      async (_images, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(scanError('REGISTRATION_CANCELLED', 400));
            },
            { once: true },
          );
        }),
    );
    await submit('shutdown');
    await eventually(async () => provider.extract.mock.calls.length > 0);
    await Promise.all(workers.map((worker) => worker.onModuleDestroy()));
    expect(aborted).toBe(true);
    expect(await stores[0].outstanding()).toEqual([]);
    expect(await readdir(directory)).toEqual([]);
  });
});
