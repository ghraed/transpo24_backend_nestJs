import { createHash } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type MemoryCounter = { count: number; expiresAt: number };

@Injectable()
export class PhoneAuthRateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(PhoneAuthRateLimitService.name);
  private readonly counters = new Map<string, MemoryCounter>();
  private readonly cooldowns = new Map<string, number>();
  private readonly redis: Redis | null;
  private didLogFallback = false;

  constructor(config: ConfigService) {
    const host = config.get<string>('REDIS_HOST')?.trim();
    const port = Number.parseInt(
      config.get<string>('REDIS_PORT') || '6379',
      10,
    );
    const password = config.get<string>('REDIS_PASSWORD')?.trim();
    this.redis = host
      ? new Redis({
          host,
          port: Number.isFinite(port) ? port : 6379,
          ...(password ? { password } : {}),
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 1000,
        })
      : null;
  }

  async assertCanSend(phoneNumber: string, ipAddress: string): Promise<void> {
    const phoneKey = this.hash(phoneNumber);
    const ipKey = this.hash(ipAddress || 'unknown');

    await Promise.all([
      this.enforceCounter(`otp:send:phone:${phoneKey}`, 5, 600),
      this.enforceCounter(`otp:send:ip:${ipKey}`, 20, 600),
    ]);

    if (!(await this.acquireCooldown(`otp:cooldown:${phoneKey}`, 60))) {
      throw new HttpException(
        'Please wait before requesting another verification code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async assertCanVerify(phoneNumber: string, ipAddress: string): Promise<void> {
    const phoneKey = this.hash(phoneNumber);
    const ipKey = this.hash(ipAddress || 'unknown');
    await Promise.all([
      this.enforceCounter(`otp:verify:phone:${phoneKey}`, 10, 600),
      this.enforceCounter(`otp:verify:ip:${ipKey}`, 30, 600),
    ]);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private async enforceCounter(
    key: string,
    limit: number,
    ttlSeconds: number,
  ): Promise<void> {
    const count = await this.increment(key, ttlSeconds);
    if (count > limit) {
      throw new HttpException(
        'Too many verification attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async increment(key: string, ttlSeconds: number): Promise<number> {
    const redis = await this.getRedis();
    if (redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, ttlSeconds);
        return count;
      } catch {
        this.logFallback();
      }
    }

    const now = Date.now();
    const current = this.counters.get(key);
    if (!current || current.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    current.count += 1;
    return current.count;
  }

  private async acquireCooldown(
    key: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const redis = await this.getRedis();
    if (redis) {
      try {
        return (await redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
      } catch {
        this.logFallback();
      }
    }

    const now = Date.now();
    const expiresAt = this.cooldowns.get(key) ?? 0;
    if (expiresAt > now) return false;
    this.cooldowns.set(key, now + ttlSeconds * 1000);
    return true;
  }

  private async getRedis(): Promise<Redis | null> {
    if (!this.redis) return null;
    if (this.redis.status === 'ready') return this.redis;
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      return this.redis;
    } catch {
      this.logFallback();
      return null;
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private logFallback(): void {
    if (this.didLogFallback) return;
    this.didLogFallback = true;
    this.logger.warn('OTP rate limiting is using the in-process fallback.');
  }
}
