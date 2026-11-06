import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PhoneAuthRateLimitService } from './phone-auth-rate-limit.service';

let mockRedis: {
  status: string;
  connect: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  set: jest.Mock;
  quit: jest.Mock;
  disconnect: jest.Mock;
};
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => mockRedis),
}));

describe('PhoneAuthRateLimitService', () => {
  it('enforces the resend cooldown with HTTP 429', async () => {
    const service = new PhoneAuthRateLimitService(
      new ConfigService({ REDIS_HOST: '' }),
    );
    await service.assertCanSend('+96170123456', '127.0.0.1');

    await expect(
      service.assertCanSend('+96170123456', '127.0.0.1'),
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe('concurrent Redis initialization', () => {
  it('waits for the same first connection before either OTP counter uses Redis', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    let finish!: () => void;
    mockRedis = {
      status: 'wait',
      connect: jest.fn(() => {
        mockRedis.status = 'connecting';
        return new Promise<void>((resolve) => {
          finish = () => {
            mockRedis.status = 'ready';
            resolve();
          };
        });
      }),
      incr: jest.fn(async () => {
        if (mockRedis.status !== 'ready')
          throw new Error('Offline queue disabled while connecting');
        return 1;
      }),
      expire: jest.fn(async () => 1),
      set: jest.fn(async () => 'OK'),
      quit: jest.fn(async () => undefined),
      disconnect: jest.fn(),
    };
    const service = new PhoneAuthRateLimitService(
      new ConfigService({ REDIS_HOST: 'synthetic-redis', REDIS_PORT: '57433' }),
    );
    try {
      const sending = service.assertCanSend('+12025550111', '127.0.0.1');
      await Promise.resolve();
      await Promise.resolve();
      expect(mockRedis.incr).not.toHaveBeenCalled();
      finish();
      await sending;
      expect(mockRedis.connect).toHaveBeenCalledTimes(1);
      expect(mockRedis.incr).toHaveBeenCalledTimes(2);
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      expect(warning).not.toHaveBeenCalled();
    } finally {
      finish?.();
      await service.onModuleDestroy();
      warning.mockRestore();
    }
  });
});
