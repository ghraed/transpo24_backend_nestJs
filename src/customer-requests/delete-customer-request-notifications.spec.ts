import { ForbiddenException } from '@nestjs/common';
import { TransportRequestStatus } from '@prisma/client';
import { CustomerRequestsService } from './customer-requests.service';

describe('deleting a customer request', () => {
  function setup() {
    const request = {
      id: 'request-1',
      customerId: 'owner-1',
      status: TransportRequestStatus.PENDING_QUOTES,
      driverAlerts: [{ driverId: 'driver-1' }],
      paymentHold: null,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      transportRequest: {
        findUnique: jest.fn().mockResolvedValue({ ...request, deletedByCustomerAt: null }),
        update: jest.fn().mockResolvedValue(request),
      },
      customerNotification: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      transportRequest: { findUnique: jest.fn().mockResolvedValue(request) },
      $transaction: jest.fn((callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const gateway = { emitRequestDeleted: jest.fn() };
    const service = new CustomerRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      gateway as never,
      {} as never,
    );
    return { service, prisma, tx, gateway };
  }

  it('removes only the owner’s alerts for the deleted request in the same transaction', async () => {
    const { service, tx, gateway } = setup();

    await service.deleteCustomerRequest({ customerId: 'owner-1', requestId: 'request-1' });

    expect(tx.transportRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { deletedByCustomerAt: expect.any(Date), status: 'CANCELLED' },
    });
    expect(tx.customerNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'owner-1',
        OR: [
          { data: { path: ['requestId'], equals: 'request-1' } },
          { data: { path: ['tripId'], equals: 'request-1' } },
          { data: { path: ['transportRequestId'], equals: 'request-1' } },
        ],
      },
    });
    expect(gateway.emitRequestDeleted).toHaveBeenCalledWith('driver-1', {
      requestId: 'request-1',
    });
  });

  it('does not remove alerts when the caller does not own the request', async () => {
    const { service, prisma, tx } = setup();

    await expect(
      service.deleteCustomerRequest({ customerId: 'other-1', requestId: 'request-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.customerNotification.deleteMany).not.toHaveBeenCalled();
  });
});
