import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PhoneAuthRateLimitService } from './phone-auth-rate-limit.service';

describe('PhoneAuthRateLimitService', () => {
  it('enforces the resend cooldown with HTTP 429', async () => {
    const service = new PhoneAuthRateLimitService(
      new ConfigService({ REDIS_HOST: '' }),
    );
    await service.assertCanSend('+96170123456', '127.0.0.1');

    await expect(
      service.assertCanSend('+96170123456', '127.0.0.1'),
    ).rejects.toMatchObject<HttpException>({ status: 429 });
  });
});
