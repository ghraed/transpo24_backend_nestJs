import { Prisma } from '@prisma/client';
import { DriverService } from './driver.service';

const D = (amount: number) => new Prisma.Decimal(amount);
const createdAt = new Date('2026-10-31T13:20:00Z');
function fixture() {
  const held = {
    id: 'held-trip',
    status: 'DRIVER_GOING_TO_PICKUP',
    createdAt,
    deliveredAt: null,
    driverEarning: null,
    paymentHold: {
      id: 'held',
      driverId: 'driver',
      amount: D(21),
      customerPlatformFeeAmount: D(1),
      currency: 'CHF',
      status: 'PAYMENT_HELD',
    },
    paymentSettlement: { requiresManualReview: false },
  };
  const captured = {
    ...held,
    id: 'captured-trip',
    status: 'DELIVERED',
    deliveredAt: createdAt,
    driverEarning: {
      id: 'earning',
      driverId: 'driver',
      tripId: 'captured-trip',
      grossAmount: D(20),
      platformFeeAmount: D(3),
      netAmount: D(17),
      currency: 'CHF',
      status: 'PAID_OUT',
      createdAt,
      availableAt: createdAt,
      paidOutAt: createdAt,
      stripeTransferId: null,
      stripeTransferStatus: 'direct_charge',
    },
    paymentHold: { ...held.paymentHold, status: 'PAYMENT_CAPTURED' },
  };
  const db = {
    transportRequest: {
      findMany: jest.fn().mockResolvedValue([held, captured]),
      count: jest.fn().mockResolvedValue(2),
    },
  };
  const service = new DriverService(db as never, {} as never, {} as never);
  jest
    .spyOn(service as any, 'validateDriverCanViewEarnings')
    .mockResolvedValue({ id: 'driver' });
  return { service, db, held, captured };
}

it('includes an authorization before an earning exists alongside captured earnings without duplicate trips', async () => {
  const { service, db } = fixture();
  const result = await service.getDriverPaymentHistory({
    driverId: 'user',
    page: 1,
    limit: 20,
  });
  expect(result.items).toHaveLength(2);
  expect(result.items[0]).toMatchObject({
    tripId: 'held-trip',
    netAmount: 17,
    grossAmount: 20,
    platformFeeAmount: 3,
    status: 'PENDING',
    paymentStatus: 'PAYMENT_HELD',
  });
  expect(result.items[1]).toMatchObject({
    tripId: 'captured-trip',
    netAmount: 17,
    status: 'PAID_OUT',
    paymentStatus: 'PAYMENT_CAPTURED',
  });
  expect(db.transportRequest.findMany.mock.calls[0][0].where.OR).toEqual([
    { driverEarning: { is: { driverId: 'driver' } } },
    { paymentHold: { is: { driverId: 'driver' } } },
  ]);
});

it('keeps cancelled captured payments visibly under review', async () => {
  const x = fixture();
  x.held.status = 'CANCELLED';
  x.held.paymentHold.status = 'PAYMENT_CAPTURED';
  x.held.paymentSettlement.requiresManualReview = true;
  const result = await x.service.getDriverPaymentHistory({
    driverId: 'user',
    page: 1,
    limit: 20,
  });
  expect(result.items[0]).toMatchObject({
    tripStatus: 'CANCELLED',
    paymentStatus: 'PAYMENT_CAPTURED',
    requiresManualReview: true,
  });
});

it('paginates in the database and uses the same filtered count', async () => {
  const x = fixture();
  x.db.transportRequest.count.mockResolvedValue(45);
  const result = await x.service.getDriverPaymentHistory({
    driverId: 'user',
    page: 2,
    limit: 20,
    status: 'PENDING',
  });
  const query = x.db.transportRequest.findMany.mock.calls[0][0];
  expect(query).toMatchObject({
    skip: 20,
    take: 20,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  expect(x.db.transportRequest.count).toHaveBeenCalledWith({
    where: query.where,
  });
  expect(result).toMatchObject({ page: 2, total: 45, totalPages: 3 });
});

it('does not expose a reassigned driver earning through an owned hold', async () => {
  const x = fixture();
  x.captured.driverEarning.driverId = 'another-driver';
  x.captured.driverEarning.netAmount = D(999);
  const result = await x.service.getDriverPaymentHistory({
    driverId: 'user',
    page: 1,
    limit: 20,
  });
  expect(result.items[1].netAmount).toBe(17);
});

it('keeps a hold-level review restriction even when settlement metadata is absent', async () => {
  const x = fixture();
  Object.assign(x.held.paymentHold, { confirmationState: 'MANUAL_REVIEW' });
  const result = await x.service.getDriverPaymentHistory({
    driverId: 'user',
    page: 1,
    limit: 20,
  });
  expect(result.items[0].requiresManualReview).toBe(true);
});
