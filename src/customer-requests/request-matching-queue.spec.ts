import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { RequestMatchingQueueService } from './request-matching-queue.service';
import { CustomerRequestsService } from './customer-requests.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
    close: jest.fn(),
  })),
  Worker: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));
function setup(config: Record<string, string> = {}) {
  const requests = {
    matchPublishedRequest: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RequestMatchingQueueService(
    { get: (key: string) => config[key] } as ConfigService,
    requests as unknown as CustomerRequestsService,
  );
  return { service, requests };
}
beforeEach(() => jest.clearAllMocks());
it('keeps synchronous matching when queue rollout is disabled', async () => {
  const { service } = setup({ REDIS_HOST: 'localhost' });
  service.onModuleInit();
  expect(await service.enqueue('request')).toBe(false);
  expect(Queue).not.toHaveBeenCalled();
});
it('requires Redis when explicitly enabled', () => {
  expect(() =>
    setup({ MATCHING_QUEUE_ENABLED: 'true' }).service.onModuleInit(),
  ).toThrow('requires REDIS_HOST');
});
it('queues only request IDs and retries by reloading through the publication service', async () => {
  const { service, requests } = setup({
    MATCHING_QUEUE_ENABLED: 'true',
    REDIS_HOST: 'localhost',
  });
  service.onModuleInit();
  const queue = (Queue as unknown as jest.Mock).mock.results[0].value as {
    add: jest.Mock;
    close: jest.Mock;
  };
  expect(await service.enqueue('request')).toBe(true);
  expect(queue.add).toHaveBeenCalledWith('match-request', {
    requestId: 'request',
  });
  const process = (Worker as unknown as jest.Mock).mock.calls[0][1] as (job: {
    data: { requestId: string };
  }) => Promise<void>;
  await process({ data: { requestId: 'request' } });
  expect(requests.matchPublishedRequest).toHaveBeenCalledWith('request');
  await service.onModuleDestroy();
  expect(queue.close).toHaveBeenCalled();
});
it('falls back to synchronous dispatch when enqueue fails', async () => {
  const { service } = setup({
    MATCHING_QUEUE_ENABLED: 'true',
    REDIS_HOST: 'localhost',
  });
  service.onModuleInit();
  const queue = (Queue as unknown as jest.Mock).mock.results[0].value as {
    add: jest.Mock;
  };
  queue.add.mockRejectedValue(new Error('Redis unavailable'));
  expect(await service.enqueue('request')).toBe(false);
});
