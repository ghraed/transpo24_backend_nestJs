import { ServiceUnavailableException } from '@nestjs/common';

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports process liveness without touching dependencies', () => {
    const queryRaw = jest.fn();
    const service = new HealthService({ $queryRaw: queryRaw } as never);

    const status = service.liveness();
    expect(status.status).toBe('ok');
    expect(Number.isNaN(Date.parse(status.timestamp))).toBe(false);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness when the database responds', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService({ $queryRaw: queryRaw } as never);

    const status = await service.readiness();
    expect(status.status).toBe('ok');
    expect(Number.isNaN(Date.parse(status.timestamp))).toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns a sanitized unavailable error when the database fails', async () => {
    const queryRaw = jest
      .fn()
      .mockRejectedValue(new Error('password authentication failed'));
    const service = new HealthService({ $queryRaw: queryRaw } as never);

    await expect(service.readiness()).rejects.toEqual(
      new ServiceUnavailableException('Database is unavailable.'),
    );
  });
});
