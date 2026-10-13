import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { scanError } from './registration.errors';
import type { RegistrationJobRecord } from './registration-job.types';

// Reservations stay present until files and active work have actually been cleaned up.
// Pending records have no TTL: the sweeper must be able to reconcile them after a crash.
const RESERVE = `
if redis.call('GET', KEYS[2]) then return 'REGISTRATION_ALREADY_PENDING' end
if redis.call('SCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 'REGISTRATION_QUEUE_FULL' end
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[1])
redis.call('SET', KEYS[3], ARGV[3])
return ''`;

const UPDATE = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local record = cjson.decode(raw)
local allowed = cjson.decode(ARGV[1])
local ok = false
for _, status in ipairs(allowed) do if record.status == status then ok = true end end
if not ok then return raw end
local patch = cjson.decode(ARGV[2])
for key, value in pairs(patch) do record[key] = value end
if patch.status == 'cancelled' or patch.status == 'expired' then record.result = nil end
raw = cjson.encode(record)
redis.call('SET', KEYS[1], raw, 'KEEPTTL')
return raw`;

const RELEASE = `
redis.call('SREM', KEYS[1], ARGV[1])
if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
redis.call('EXPIRE', KEYS[3], ARGV[2])
return 1`;

const COUNT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count`;

@Injectable()
export class RegistrationJobStore implements OnApplicationShutdown {
  readonly prefix: string;
  readonly redis: Redis | null;

  constructor(config: ConfigService) {
    this.prefix =
      config.get<string>('REGISTRATION_QUEUE_PREFIX')?.trim() ||
      'transpo24-registration';
    if (!/^[a-zA-Z0-9_-]+$/.test(this.prefix))
      throw new Error(
        'REGISTRATION_QUEUE_PREFIX must contain only letters, digits, underscores or hyphens.',
      );
    const host = config.get<string>('REDIS_HOST')?.trim();
    this.redis = host
      ? new Redis({
          host,
          port: Number(config.get<string>('REDIS_PORT') || 6379),
          password: config.get<string>('REDIS_PASSWORD')?.trim() || undefined,
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 1000,
          commandTimeout: 2000,
        })
      : null;
    // Connection failures are reported as safe feature errors, never unhandled events.
    this.redis?.on('error', () => undefined);
  }

  async ready(): Promise<Redis> {
    if (!this.redis) throw scanError('REGISTRATION_UNAVAILABLE', 503);
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      if (this.redis.status !== 'ready') throw new Error();
      return this.redis;
    } catch {
      throw scanError('REGISTRATION_UNAVAILABLE', 503);
    }
  }

  key(id: string) {
    return `${this.prefix}:record:${id}`;
  }
  private ownerKey(owner: string) {
    return `${this.prefix}:owner:${owner}`;
  }
  private get outstandingKey() {
    return `${this.prefix}:outstanding`;
  }

  private async command<T>(run: (redis: Redis) => Promise<T>): Promise<T> {
    try {
      return await run(await this.ready());
    } catch {
      throw scanError('REGISTRATION_UNAVAILABLE', 503);
    }
  }

  async reserve(record: RegistrationJobRecord, maximum: number) {
    const code = await this.command((redis) =>
      redis.eval(
        RESERVE,
        3,
        this.outstandingKey,
        this.ownerKey(record.ownerId),
        this.key(record.jobId),
        record.jobId,
        maximum,
        JSON.stringify(record),
      ),
    );
    if (typeof code === 'string' && code) throw scanError(code, 429);
  }

  async get(id: string): Promise<RegistrationJobRecord | null> {
    const raw = await this.command((redis) => redis.get(this.key(id)));
    return raw ? this.decode(raw) : null;
  }

  private decode(raw: string): RegistrationJobRecord {
    const record = JSON.parse(raw) as Omit<RegistrationJobRecord, 'result'> & {
      result?: string;
    };
    return {
      ...record,
      ...(record.result
        ? {
            result: JSON.parse(
              record.result,
            ) as RegistrationJobRecord['result'],
          }
        : { result: undefined }),
    };
  }

  async update(
    id: string,
    allowed: RegistrationJobRecord['status'][],
    patch: Partial<RegistrationJobRecord>,
  ) {
    const raw = await this.command((redis) =>
      redis.eval(
        UPDATE,
        1,
        this.key(id),
        JSON.stringify(allowed),
        // Lua cjson cannot round-trip empty arrays. Preserve the extraction
        // as an opaque JSON string while atomically updating its envelope.
        JSON.stringify({
          ...patch,
          ...(patch.result ? { result: JSON.stringify(patch.result) } : {}),
        }),
      ),
    );
    return typeof raw === 'string' ? this.decode(raw) : null;
  }

  async release(record: RegistrationJobRecord, retentionSeconds: number) {
    await this.command((redis) =>
      redis.eval(
        RELEASE,
        3,
        this.outstandingKey,
        this.ownerKey(record.ownerId),
        this.key(record.jobId),
        record.jobId,
        retentionSeconds,
      ),
    );
  }

  async outstanding(): Promise<string[]> {
    return this.command((redis) => redis.smembers(this.outstandingKey));
  }

  async limit(
    owner: string,
    kind: 'minute' | 'hour' | 'poll',
    maximum: number,
    seconds: number,
  ) {
    const count = await this.command((redis) =>
      redis.eval(COUNT, 1, `${this.prefix}:limit:${kind}:${owner}`, seconds),
    );
    if (Number(count) > maximum)
      throw scanError('REGISTRATION_RATE_LIMIT', 429);
  }

  onApplicationShutdown() {
    this.redis?.disconnect();
  }
}
