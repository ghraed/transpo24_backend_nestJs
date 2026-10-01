import { CustomerRequestsService } from './customer-requests.service';

describe('request quote summary with different offer currencies', () => {
  function setup(offers: Array<{ price: number; currency: string }>) {
    const prisma = {
      transportRequest: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'request', customerId: 'customer' }),
      },
      driverOffer: { findMany: jest.fn().mockResolvedValue(offers) },
    };
    const service = new CustomerRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    Object.assign(service, {
      toStatusResponseDto: jest.fn((_request, summary) => ({
        quotesSummary: summary,
      })),
      canEditRequest: jest.fn().mockResolvedValue(true),
    });
    return service;
  }

  it('does not call a raw number the lowest offer across USD and EUR', async () => {
    const service = setup([
      { price: 90, currency: 'EUR' },
      { price: 100, currency: 'USD' },
    ]);
    await expect(
      service.getCustomerRequestStatus({
        customerId: 'customer',
        requestId: 'request',
      }),
    ).resolves.toMatchObject({
      quotesSummary: { count: 2, lowestPrice: null, currency: null },
    });
  });

  it('keeps a lowest offer when all offers share a currency', async () => {
    const service = setup([
      { price: 90, currency: 'USD' },
      { price: 100, currency: 'USD' },
    ]);
    await expect(
      service.getCustomerRequestStatus({
        customerId: 'customer',
        requestId: 'request',
      }),
    ).resolves.toMatchObject({
      quotesSummary: { count: 2, lowestPrice: 90, currency: 'USD' },
    });
  });
});
