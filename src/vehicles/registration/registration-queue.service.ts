import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Job, Queue, Worker } from 'bullmq';
import { scanError } from './registration.errors';
import { RegistrationJobStore } from './registration-job.store';
import {
  isTerminalScan,
  type RegistrationJobRecord,
  type RegistrationJobView,
} from './registration-job.types';
import { RegistrationService } from './registration.service';
import { QwenRegistrationProvider } from './qwen-registration.provider';

type ScanJob = { jobId: string };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@Injectable()
export class RegistrationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RegistrationQueueService.name);
  readonly storageDirectory: string;
  readonly uploadTimeoutMs: number;
  readonly jobTimeoutMs: number;
  readonly retentionSeconds: number;
  private readonly concurrency: number;
  private readonly maximum: number;
  private queue: Queue<ScanJob> | null = null;
  private worker: Worker<ScanJob> | null = null;
  private initializing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweeping = false;
  private stopping = false;
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly config: ConfigService,
    readonly store: RegistrationJobStore,
    private readonly service: RegistrationService,
    private readonly provider: QwenRegistrationProvider,
  ) {
    const integer = (key: string, fallback: number) => {
      const raw = config.get<string>(key);
      const value = raw === undefined || raw === '' ? fallback : Number(raw);
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error(`${key} must be a positive integer.`);
      return value;
    };
    this.concurrency = integer('REGISTRATION_QUEUE_CONCURRENCY', 1);
    this.maximum = integer('REGISTRATION_QUEUE_MAX_OUTSTANDING', 20);
    this.uploadTimeoutMs = integer('REGISTRATION_UPLOAD_TIMEOUT_MS', 30000);
    this.jobTimeoutMs = integer('REGISTRATION_JOB_TIMEOUT_MS', 300000);
    this.retentionSeconds = integer('REGISTRATION_RESULT_TTL_SECONDS', 300);
    this.storageDirectory = resolve(
      config.get<string>('REGISTRATION_STORAGE_DIR') ||
        join(tmpdir(), store.prefix),
    );
  }

  async onModuleInit() {
    await this.ensureReady().catch(() =>
      this.logger.warn(
        'Registration queue unavailable; scans will fail safely until Redis reconnects.',
      ),
    );
    this.timer = setInterval(() => {
      void this.sweep().catch(() =>
        this.logger.warn('Registration queue reconciliation unavailable.'),
      );
    }, 15000);
    this.timer.unref();
  }

  private async ensureReady() {
    if (this.stopping) throw scanError('REGISTRATION_UNAVAILABLE', 503);
    await this.store.ready();
    if (this.worker) return;
    if (!this.initializing)
      this.initializing = this.initialize().finally(() => {
        this.initializing = null;
      });
    await this.initializing;
  }

  private async initialize() {
    const publicRoot = await realpath(resolve('uploads')).catch(() =>
      resolve('uploads'),
    );
    const existing = await realpath(this.storageDirectory).catch(
      () => this.storageDirectory,
    );
    if (
      existing === resolve(tmpdir()) ||
      existing === publicRoot ||
      existing.startsWith(publicRoot + sep) ||
      publicRoot.startsWith(existing + sep)
    )
      throw new Error(
        'REGISTRATION_STORAGE_DIR must be a dedicated private directory outside public uploads.',
      );
    await mkdir(this.storageDirectory, { recursive: true, mode: 0o700 });
    const actual = await realpath(this.storageDirectory);
    if (actual === publicRoot || actual.startsWith(publicRoot + sep))
      throw scanError('REGISTRATION_CONFIGURATION', 503);
    await chmod(this.storageDirectory, 0o700);
    const redis = await this.store.ready();
    const options = redis.options;
    const connection = {
      host: options.host,
      port: options.port,
      password: options.password,
      connectTimeout: 1000,
    };
    this.queue = new Queue<ScanJob>('registration-extractions', {
      prefix: this.store.prefix,
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        commandTimeout: 2000,
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    this.queue.on('error', () =>
      this.logger.warn('Registration queue connection unavailable.'),
    );
    try {
      await this.queue.setGlobalConcurrency(this.concurrency);
      this.worker = new Worker<ScanJob>(
        'registration-extractions',
        (job) => this.process(job),
        {
          prefix: this.store.prefix,
          connection: { ...connection, maxRetriesPerRequest: null },
          concurrency: this.concurrency,
          maxStalledCount: 1,
        },
      );
      this.worker.on('error', () =>
        this.logger.warn('Registration worker connection unavailable.'),
      );
      this.worker.on('failed', (job) => {
        if (job) void this.failStalled(job.data.jobId).catch(() => undefined);
      });
    } catch (error) {
      await this.queue.close();
      this.queue = null;
      throw error;
    }
  }

  directory(id: string) {
    if (!UUID.test(id)) throw scanError('REGISTRATION_NOT_FOUND', 404);
    return join(this.storageDirectory, id);
  }

  async reserve(ownerId: string) {
    this.provider.assertConfigured();
    await this.ensureReady();
    const record: RegistrationJobRecord = {
      jobId: randomUUID(),
      ownerId,
      status: 'uploading',
      expiresAt: Date.now() + this.uploadTimeoutMs,
    };
    await this.store.reserve(record, this.maximum);
    try {
      await mkdir(this.directory(record.jobId), { mode: 0o700 });
    } catch {
      await this.abandon(record.jobId);
      throw scanError('REGISTRATION_UNAVAILABLE', 503);
    }
    return record;
  }

  async enqueue(
    id: string,
    files: Express.Multer.File[],
  ): Promise<RegistrationJobView> {
    if (!files?.length || files.length > 2)
      throw scanError('REGISTRATION_INVALID_UPLOAD', 400);
    for (const file of files) await chmod(file.path, 0o600);
    const record = await this.store.update(id, ['uploading'], {
      status: 'queued',
      expiresAt: Date.now() + this.jobTimeoutMs,
      files: files.map((file) => file.filename),
    });
    if (!record || record.status !== 'queued')
      throw scanError('REGISTRATION_TIMEOUT', 504);
    try {
      await this.queue!.add('extract', { jobId: id }, { jobId: id });
    } catch {
      // An ambiguous Redis error may have added the job. Cancel through the same
      // state machine; never delete files underneath an active processor.
      await this.abandon(id);
      throw scanError('REGISTRATION_UNAVAILABLE', 503);
    }
    return this.view(record);
  }

  private view(record: RegistrationJobRecord): RegistrationJobView {
    return {
      jobId: record.jobId,
      status: record.status === 'uploading' ? 'queued' : record.status,
      expiresAt: new Date(record.expiresAt).toISOString(),
      ...(record.result ? { result: record.result } : {}),
      ...(record.error ? { error: record.error } : {}),
    };
  }

  private async owned(owner: string, id: string) {
    this.directory(id);
    const record = await this.store.get(id);
    if (!record || record.ownerId !== owner)
      throw scanError('REGISTRATION_NOT_FOUND', 404);
    return record;
  }

  async status(owner: string, id: string) {
    let record = await this.owned(owner, id);
    if (!isTerminalScan(record.status) && record.expiresAt <= Date.now()) {
      await this.terminate(id, 'expired');
      record = (await this.store.get(id))!;
    }
    return this.view(record);
  }

  async cancel(owner: string, id: string) {
    await this.owned(owner, id);
    await this.terminate(id, 'cancelled');
    return this.view((await this.store.get(id))!);
  }

  async abandon(id: string) {
    await this.terminate(id, 'cancelled');
  }

  private async terminate(id: string, status: 'cancelled' | 'expired') {
    const allowed: RegistrationJobRecord['status'][] =
      status === 'cancelled'
        ? [
            'uploading',
            'queued',
            'processing',
            'completed',
            'failed',
            'expired',
          ]
        : ['uploading', 'queued', 'processing'];
    const record = await this.store.update(id, allowed, {
      status,
      error: {
        code:
          status === 'expired'
            ? 'REGISTRATION_TIMEOUT'
            : 'REGISTRATION_CANCELLED',
      },
    });
    this.active.get(id)?.abort();
    if (record && isTerminalScan(record.status))
      await this.cleanupInactive(record);
  }

  private async cleanupInactive(record: RegistrationJobRecord) {
    if (this.active.has(record.jobId)) return;
    const job = await this.queue?.getJob(record.jobId);
    if (job) {
      if ((await job.getState()) === 'active') return;
      try {
        await job.remove();
      } catch {
        return;
      } // A worker may have acquired the lock.
    }
    await this.cleanup(record);
  }

  private async cleanup(record: RegistrationJobRecord) {
    await rm(this.directory(record.jobId), { recursive: true, force: true });
    await this.store.release(record, this.retentionSeconds);
  }

  private async failStalled(id: string) {
    const record = await this.store.update(id, ['queued', 'processing'], {
      status: 'failed',
      error: { code: 'REGISTRATION_UNAVAILABLE' },
    });
    if (record) await this.cleanupInactive(record);
  }

  private async process(job: Job<ScanJob>) {
    const id = job.data.jobId;
    const initial = await this.store.get(id);
    if (!initial) return;
    if (initial.expiresAt <= Date.now()) {
      await this.terminate(id, 'expired');
      return;
    }
    const record = await this.store.update(id, ['queued', 'processing'], {
      status: 'processing',
    });
    if (!record || record.status !== 'processing') {
      await this.cleanup(initial);
      return;
    }
    const abort = new AbortController();
    this.active.set(id, abort);
    if (this.stopping) abort.abort();
    const started = Date.now();
    let deadlineReached = false;
    const deadline = setTimeout(
      () => {
        deadlineReached = true;
        abort.abort();
      },
      Math.max(1, record.expiresAt - Date.now()),
    );
    // Poll shared cancellation state, including when DELETE reached another API instance.
    let checking = false;
    const watch = setInterval(() => {
      if (checking) return;
      checking = true;
      void this.store
        .get(id)
        .then((current) => {
          if (!current || isTerminalScan(current.status)) abort.abort();
        })
        .catch(() => abort.abort())
        .finally(() => {
          checking = false;
        });
    }, 500);
    try {
      const files = (record.files ?? []).map((name) => {
        if (!UUID.test(name)) throw scanError('REGISTRATION_UNAVAILABLE', 503);
        return { path: join(this.directory(id), name) } as Express.Multer.File;
      });
      const result = await this.service.extract(files, abort.signal);
      if (Date.now() >= record.expiresAt)
        throw scanError('REGISTRATION_TIMEOUT', 504);
      if (abort.signal.aborted) throw scanError('REGISTRATION_CANCELLED', 400);
      await this.store.update(id, ['processing'], {
        status: 'completed',
        result,
      });
    } catch (error) {
      const expired = deadlineReached || Date.now() >= record.expiresAt;
      const payload =
        error && typeof error === 'object' && 'getResponse' in error
          ? (error as { getResponse(): { code?: string } }).getResponse()
          : undefined;
      const code = payload?.code?.startsWith('REGISTRATION_')
        ? payload.code
        : 'REGISTRATION_UNAVAILABLE';
      await this.store.update(id, ['processing'], {
        status: expired ? 'expired' : 'failed',
        error: { code: expired ? 'REGISTRATION_TIMEOUT' : code },
      });
    } finally {
      clearTimeout(deadline);
      clearInterval(watch);
      this.active.delete(id);
      await this.cleanup(record);
      this.logger.log(
        JSON.stringify({
          event: 'registration_job_finished',
          durationMs: Date.now() - started,
          waitMs: started - job.timestamp,
        }),
      );
    }
  }

  async sweep() {
    if (this.sweeping || this.stopping) return;
    this.sweeping = true;
    try {
      await this.ensureReady();
      const ids = await this.store.outstanding();
      for (const id of ids) {
        const record = await this.store.get(id);
        if (!record) continue;
        if (!isTerminalScan(record.status) && record.expiresAt <= Date.now())
          await this.terminate(id, 'expired');
        else if (isTerminalScan(record.status))
          await this.cleanupInactive(record);
      }
      // Reconcile directories created just before a crash or lost Redis state.
      for (const entry of await readdir(this.storageDirectory, {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory() || !UUID.test(entry.name)) continue;
        const path = this.directory(entry.name);
        const info = await stat(path).catch(() => null);
        if (
          info &&
          Date.now() - info.mtimeMs > this.uploadTimeoutMs &&
          !(await this.store.get(entry.name))
        )
          await rm(path, { recursive: true, force: true });
      }
      this.logger.debug(
        JSON.stringify({
          event: 'registration_queue_snapshot',
          outstanding: ids.length,
          ...(await this.queue!.getJobCounts('waiting', 'active')),
        }),
      );
    } finally {
      this.sweeping = false;
    }
  }

  async waitForLegacy(owner: string, id: string, signal: AbortSignal) {
    const deadline = Date.now() + 90000;
    try {
      while (!signal.aborted && Date.now() < deadline) {
        const state = await this.status(owner, id);
        if (state.status === 'completed') return state.result!;
        if (isTerminalScan(state.status)) {
          const code = state.error?.code || 'REGISTRATION_UNAVAILABLE';
          const status =
            code === 'REGISTRATION_INVALID_UPLOAD' ||
            code === 'REGISTRATION_CANCELLED'
              ? 400
              : code === 'REGISTRATION_RATE_LIMIT'
                ? 429
                : code === 'REGISTRATION_TIMEOUT'
                  ? 504
                  : code === 'REGISTRATION_INVALID_OUTPUT'
                    ? 502
                    : 503;
          throw scanError(code, status);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw scanError(
        signal.aborted ? 'REGISTRATION_CANCELLED' : 'REGISTRATION_TIMEOUT',
        signal.aborted ? 400 : 504,
      );
    } finally {
      await this.abandon(id);
    }
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.worker?.pause(true);
    for (const abort of this.active.values()) abort.abort();
    await this.worker?.close();
    await this.queue?.close();
  }
}
