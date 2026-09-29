import { ConfigService } from '@nestjs/config';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { TranslationCacheService } from './translation-cache.service';
import { TranslationRateLimitGuard } from './translation-rate-limit.guard';

function createCache(values: Record<string, string> = {}) {
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  return new TranslationCacheService(config);
}

describe('TranslationCacheService memory fallback', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T12:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('uses positive configured limits and defaults for invalid values', () => {
    const cache = createCache({
      TRANSLATION_CACHE_TTL_SECONDS: '7',
      TRANSLATION_RATE_LIMIT_WINDOW_SECONDS: '0',
      TRANSLATION_RATE_LIMIT_MAX_REQUESTS: '-1',
    });
    expect(cache.cacheTtlSeconds).toBe(7);
    expect(cache.rateLimitWindowSeconds).toBeGreaterThan(0);
    expect(cache.rateLimitMaxRequests).toBeGreaterThan(0);
  });

  it('keys identical text consistently but separates languages and text', () => {
    const cache = createCache();
    const input = {
      sourceLanguage: 'en' as const,
      targetLanguage: 'fr' as const,
      text: 'Hello',
    };
    expect(cache.buildTranslationCacheKey(input)).toBe(
      cache.buildTranslationCacheKey(input),
    );
    expect(cache.buildTranslationCacheKey(input)).not.toBe(
      cache.buildTranslationCacheKey({ ...input, text: 'hello' }),
    );
    expect(cache.buildTranslationCacheKey(input)).not.toBe(
      cache.buildTranslationCacheKey({ ...input, targetLanguage: 'ar' }),
    );
    expect(cache.buildTranslationCacheKey(input)).not.toContain('Hello');
  });

  it('returns cached text before expiry and misses at expiry', async () => {
    const cache = createCache();
    expect(await cache.get('missing')).toBeNull();
    await cache.set('key', 'translated', 2);
    expect(await cache.get('key')).toBe('translated');
    jest.advanceTimersByTime(2000);
    expect(await cache.get('key')).toBeNull();
  });

  it('resets the counter after the window expires', async () => {
    const cache = createCache();
    expect(await cache.incrementRateLimitCounter('user', 2)).toBe(1);
    expect(await cache.incrementRateLimitCounter('user', 2)).toBe(2);
    jest.advanceTimersByTime(2000);
    expect(await cache.incrementRateLimitCounter('user', 2)).toBe(1);
  });
});

describe('TranslationRateLimitGuard', () => {
  const counter = jest.fn();
  const cache = {
    incrementRateLimitCounter: counter,
    rateLimitWindowSeconds: 30,
    rateLimitMaxRequests: 2,
  };
  const guard = new TranslationRateLimitGuard(cache as never);
  const context = (userId?: string, ip?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: userId ? { id: userId } : undefined, ip }),
      }),
    }) as ExecutionContext;

  beforeEach(() => counter.mockReset());

  it('uses authenticated identity and permits the request at the limit', async () => {
    counter.mockResolvedValue(2);
    await expect(
      guard.canActivate(context('user-1', '127.0.0.1')),
    ).resolves.toBe(true);
    expect(counter).toHaveBeenCalledWith('translation-rate-limit:user-1', 30);
  });

  it('uses IP or a stable anonymous identifier and rejects over the limit', async () => {
    counter.mockResolvedValue(3);
    await expect(
      guard.canActivate(context(undefined, '127.0.0.1')),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(counter).toHaveBeenCalledWith(
      'translation-rate-limit:127.0.0.1',
      30,
    );
    await expect(guard.canActivate(context())).rejects.toThrow(HttpException);
    expect(counter).toHaveBeenLastCalledWith(
      'translation-rate-limit:unknown-client',
      30,
    );
  });

  it('propagates a counter failure', async () => {
    counter.mockRejectedValue(new Error('cache unavailable'));
    await expect(guard.canActivate(context('user-1'))).rejects.toThrow(
      'cache unavailable',
    );
  });
});
