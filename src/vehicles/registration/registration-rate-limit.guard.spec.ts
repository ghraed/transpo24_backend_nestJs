import type { ExecutionContext } from '@nestjs/common';
import { RegistrationRateLimitGuard } from './registration-rate-limit.guard';
import { RegistrationJobStore } from './registration-job.store';
import { scanError } from './registration.errors';

describe('registration rate limits', () => {
  const context = (id?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: id ? { id } : undefined }),
      }),
    }) as ExecutionContext;
  it('counts only the trusted customer with separate minute/hour windows', async () => {
    const limit = jest.fn().mockResolvedValue(undefined);
    const guard = new RegistrationRateLimitGuard({
      limit,
    } as unknown as RegistrationJobStore);
    await expect(guard.canActivate(context('customer'))).resolves.toBe(true);
    expect(limit).toHaveBeenCalledWith('customer', 'minute', 5, 60);
    expect(limit).toHaveBeenCalledWith('customer', 'hour', 20, 3600);
    await expect(guard.canActivate(context())).rejects.toThrow();
  });
  it.each(['REGISTRATION_RATE_LIMIT', 'REGISTRATION_UNAVAILABLE'])(
    'propagates %s without a memory fallback',
    async (code) => {
      const guard = new RegistrationRateLimitGuard({
        limit: jest.fn().mockRejectedValue(scanError(code, 429)),
      } as unknown as RegistrationJobStore);
      await expect(
        guard.canActivate(context('customer')),
      ).rejects.toMatchObject({ response: { code } });
    },
  );
});
