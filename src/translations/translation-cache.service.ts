import { createHash } from 'node:crypto';

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import {
  DEFAULT_TRANSLATION_CACHE_TTL_SECONDS,
  DEFAULT_TRANSLATION_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_TRANSLATION_RATE_LIMIT_WINDOW_SECONDS,
} from './translations.constants';
import type { SupportedTranslationLanguage } from './translations.types';

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

@Injectable()
export class TranslationCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(TranslationCacheService.name);
  private readonly valueStore = new Map<string, MemoryEntry>();
  private readonly rateLimitStore = new Map<string, RateLimitEntry>();
  private readonly redis: Redis | null;
  private redisUnavailableLogged = false;

  constructor(private readonly configService: ConfigService) {
    this.redis = this.createRedisClient();
  }

  get cacheTtlSeconds(): number {
    return this.getPositiveInteger(
      this.configService.get<string>('TRANSLATION_CACHE_TTL_SECONDS'),
      DEFAULT_TRANSLATION_CACHE_TTL_SECONDS,
    );
  }

  get rateLimitWindowSeconds(): number {
    return this.getPositiveInteger(
      this.configService.get<string>('TRANSLATION_RATE_LIMIT_WINDOW_SECONDS'),
      DEFAULT_TRANSLATION_RATE_LIMIT_WINDOW_SECONDS,
    );
  }

  get rateLimitMaxRequests(): number {
    return this.getPositiveInteger(
      this.configService.get<string>('TRANSLATION_RATE_LIMIT_MAX_REQUESTS'),
      DEFAULT_TRANSLATION_RATE_LIMIT_MAX_REQUESTS,
    );
  }

  buildTranslationCacheKey(input: {
    sourceLanguage: SupportedTranslationLanguage;
    targetLanguage: SupportedTranslationLanguage;
    text: string;
  }): string {
    const textHash = createHash('sha256').update(input.text).digest('hex');
    return [
      'translations',
      input.sourceLanguage,
      input.targetLanguage,
      textHash,
    ].join(':');
  }

  async get(key: string): Promise<string | null> {
    const redis = await this.getRedisClient();
    if (redis) {
      try {
        return await redis.get(key);
      } catch {
        this.logRedisFallbackOnce();
      }
    }

    const entry = this.valueStore.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.valueStore.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(
    key: string,
    value: string,
    ttlSeconds = this.cacheTtlSeconds,
  ): Promise<void> {
    const redis = await this.getRedisClient();
    if (redis) {
      try {
        await redis.set(key, value, 'EX', ttlSeconds);
        return;
      } catch {
        this.logRedisFallbackOnce();
      }
    }

    this.valueStore.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async incrementRateLimitCounter(
    key: string,
    ttlSeconds = this.rateLimitWindowSeconds,
  ): Promise<number> {
    const redis = await this.getRedisClient();
    if (redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, ttlSeconds);
        }
        return count;
      } catch {
        this.logRedisFallbackOnce();
      }
    }

    const now = Date.now();
    const existing = this.rateLimitStore.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.rateLimitStore.set(key, {
        count: 1,
        expiresAt: now + ttlSeconds * 1000,
      });
      return 1;
    }

    existing.count += 1;
    return existing.count;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private createRedisClient(): Redis | null {
    const host = this.configService.get<string>('REDIS_HOST')?.trim();
    if (!host) {
      return null;
    }

    const port = this.getPositiveInteger(
      this.configService.get<string>('REDIS_PORT'),
      6379,
    );
    const password = this.configService.get<string>('REDIS_PASSWORD')?.trim();

    return new Redis({
      host,
      port,
      ...(password ? { password } : {}),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
    });
  }

  private async getRedisClient(): Promise<Redis | null> {
    if (!this.redis) {
      return null;
    }

    if (this.redis.status === 'ready') {
      return this.redis;
    }

    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
        return this.redis;
      }

      return null;
    } catch {
      this.logRedisFallbackOnce();
      return null;
    }
  }

  private getPositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private logRedisFallbackOnce(): void {
    if (this.redisUnavailableLogged) {
      return;
    }

    this.redisUnavailableLogged = true;
    this.logger.warn(
      JSON.stringify({
        event: 'translation_cache_redis_unavailable',
        fallback: 'memory',
      }),
    );
  }
}
