import type { ExecutionContext } from '@nestjs/common';
import { RegistrationRateLimitGuard } from './registration-rate-limit.guard';
import { TranslationCacheService } from '../../translations/translation-cache.service';

describe('registration rate limits', () => {
  const context = (id?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: id ? { id } : undefined }),
      }),
    }) as ExecutionContext;
  it('counts the trusted customer with separate minute/hour windows', async () => {
    const incrementRateLimitCounter = jest.fn().mockResolvedValue(1);
    const guard = new RegistrationRateLimitGuard({
      incrementRateLimitCounter,
    } as unknown as TranslationCacheService);
    await expect(guard.canActivate(context('customer'))).resolves.toBe(true);
    expect(incrementRateLimitCounter).toHaveBeenCalledWith(
      'registration:minute:customer',
      60,
    );
    expect(incrementRateLimitCounter).toHaveBeenCalledWith(
      'registration:hour:customer',
      3600,
    );
    await expect(guard.canActivate(context())).rejects.toThrow();
  });
  it.each([
    [6, 1],
    [1, 21],
  ])('enforces each independent allowance', async (minute, hour) => {
    const incrementRateLimitCounter = jest
      .fn()
      .mockResolvedValueOnce(minute)
      .mockResolvedValueOnce(hour);
    const guard = new RegistrationRateLimitGuard({
      incrementRateLimitCounter,
    } as unknown as TranslationCacheService);
    await expect(guard.canActivate(context('customer'))).rejects.toMatchObject({
      response: { code: 'REGISTRATION_RATE_LIMIT' },
    });
  });
});
