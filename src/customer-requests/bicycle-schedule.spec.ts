import { ItemType, ServiceKey } from '@prisma/client';
import { CustomerRequestsService } from './customer-requests.service';

describe('bicycle submission schedule', () => {
  const prisma = { service: { findUnique: jest.fn() } };
  const service = new CustomerRequestsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const validate = (request: Record<string, unknown>) =>
    (
      service as unknown as {
        validateSubmittedRequest: (request: unknown) => Promise<void>;
      }
    ).validateSubmittedRequest(request);
  const request = {
    serviceId: 'service',
    isImmediate: true,
    scheduledPickupAt: null,
    scheduledDeliveryAt: null,
    pickupLatitude: 48,
    pickupLongitude: 8,
    dropoffLatitude: 49,
    dropoffLongitude: 9,
    itemTitle: 'Bicycle — City bike',
    itemType: ItemType.OTHER,
    motorcycleType: 'OTHER',
    motorcycleCondition: 'UNKNOWN',
  };
  beforeEach(() => {
    prisma.service.findUnique.mockResolvedValue({
      id: 'service',
      key: ServiceKey.MOTORCYCLE_TRANSPORT,
    });
  });
  it('accepts immediate bicycles without a delivery date', async () => {
    await expect(validate(request)).resolves.toBeUndefined();
  });
  it('still requires delivery for scheduled bicycles', async () => {
    await expect(
      validate({
        ...request,
        isImmediate: false,
        scheduledPickupAt: new Date(Date.now() + 86400000),
      }),
    ).rejects.toThrow('Please select a delivery date.');
  });
  it('still requires delivery for immediate motorcycles', async () => {
    await expect(
      validate({ ...request, itemType: ItemType.MOTORCYCLE }),
    ).rejects.toThrow('Please select a delivery date.');
  });
  it('does not exempt other services with an OTHER item type', async () => {
    prisma.service.findUnique.mockResolvedValue({
      id: 'service',
      key: ServiceKey.GOODS_TRANSPORT,
    });
    await expect(validate(request)).rejects.toThrow(
      'Please select a delivery date.',
    );
  });
});
