import { Prisma } from '@prisma/client';
import { CustomerRequestsService } from './customer-requests.service';

describe('Customer offer prices', () => {
  it.each([
    [null, 105, 5],
    [
      {
        amount: new Prisma.Decimal(100),
        customerPlatformFeeAmount: new Prisma.Decimal(0),
      },
      100,
      0,
    ],
    [
      {
        amount: new Prisma.Decimal(105),
        customerPlatformFeeAmount: new Prisma.Decimal(5),
      },
      105,
      5,
    ],
  ])(
    'returns the client total and commission for new and existing bookings (%j)',
    async (payment, price, fee) => {
      const prisma = {
        transportRequest: {
          findUnique: jest.fn(async () => ({
            id: 'trip',
            customerId: 'client',
            status: 'QUOTED',
            paymentHold: payment
              ? { acceptedOfferId: 'offer', capturedAt: null, ...payment }
              : null,
          })),
        },
        driverOffer: {
          findMany: jest.fn(async () => [
            {
              id: 'offer',
              requestId: 'trip',
              driverId: 'driver',
              price: new Prisma.Decimal(100),
              currency: 'USD',
              createdAt: new Date(),
              status: 'PENDING',
              driver: {
                firstName: 'Driver',
                lastName: '',
                vehicles: [],
                averageRating: null,
              },
            },
          ]),
        },
      };
      const service = new CustomerRequestsService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const result = await service.getCustomerRequestOffers({
        customerId: 'client',
        requestId: 'trip',
      });
      expect(result.offers[0]).toMatchObject({
        price,
        proposedPrice: price,
        customerPlatformFeeAmount: fee,
      });
      // Pricing never changes the stored driver service price.
      expect((await prisma.driverOffer.findMany())[0].price.toString()).toBe(
        '100',
      );
    },
  );
});

describe('Mixed offer pricing and ownership', () => {
  function setup(customerId = 'client') {
    const request = {
      id: 'trip',
      customerId,
      status: 'DRIVER_ASSIGNED',
      paymentHold: {
        acceptedOfferId: 'historical',
        capturedAt: new Date(),
        amount: new Prisma.Decimal(100),
        customerPlatformFeeAmount: new Prisma.Decimal(0),
      },
    };
    const offer = (id: string, amount: number) => ({
      id,
      requestId: 'trip',
      driverId: 'driver',
      price: new Prisma.Decimal(amount),
      currency: 'CHF',
      status: 'PENDING',
      createdAt: new Date(),
      driver: {
        firstName: 'Driver',
        lastName: '',
        vehicles: [],
        averageRating: null,
      },
    });
    const prisma = {
      transportRequest: { findUnique: jest.fn(async () => request) },
      driverOffer: {
        findMany: jest.fn(async () => [
          offer('historical', 100),
          offer('other', 200),
        ]),
      },
    };
    const service = new CustomerRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }
  it('applies an existing payment snapshot only to its own offer', async () => {
    const { service } = setup();
    const result = await service.getCustomerRequestOffers({
      customerId: 'client',
      requestId: 'trip',
    });
    expect(
      result.offers.map(
        ({ id, price, customerPlatformFeeAmount, currency }) => ({
          id,
          price,
          customerPlatformFeeAmount,
          currency,
        }),
      ),
    ).toEqual([
      {
        id: 'historical',
        price: 100,
        customerPlatformFeeAmount: 0,
        currency: 'CHF',
      },
      {
        id: 'other',
        price: 210,
        customerPlatformFeeAmount: 10,
        currency: 'CHF',
      },
    ]);
  });
  it('rejects another customer before reading the offer prices', async () => {
    const { service, prisma } = setup('owner');
    await expect(
      service.getCustomerRequestOffers({
        customerId: 'stranger',
        requestId: 'trip',
      }),
    ).rejects.toThrow('not allowed');
    expect(prisma.driverOffer.findMany).not.toHaveBeenCalled();
  });
});
