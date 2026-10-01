import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';

import { DriverPayoutQueueService } from './driver-payout-queue.service';
import { PaymentsService } from './payments.service';

it('uses a BullMQ-valid ID when scheduling a driver payout', async () => {
  const service = new DriverPayoutQueueService(
    { get: () => undefined } as unknown as ConfigService,
    {} as PaymentsService,
  );
  const add = jest.fn(async (name, data, options) => {
    const queue = {
      toKey: (part: string) => `test:${part}`,
      qualifiedName: 'test',
      keys: { wait: 'test:wait' },
    };
    const job = new Job(queue as never, name, data, options, options.jobId);
    job.validateOptions(JSON.stringify(data));
  });
  (service as unknown as { queue: unknown }).queue = {
    getJob: jest.fn().mockResolvedValue(null),
    add,
  };

  await expect(
    service.enqueueDriverPayout({ tripId: 'trip-123', reason: 'delivery' }),
  ).resolves.toBe(true);
  expect(add).toHaveBeenCalledWith(
    'process-driver-payout',
    expect.objectContaining({ tripId: 'trip-123' }),
    expect.objectContaining({ jobId: 'driver-payout-trip-123' }),
  );
});
