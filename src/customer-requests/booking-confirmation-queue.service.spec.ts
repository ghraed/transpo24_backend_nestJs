import { BookingConfirmationQueueService } from './booking-confirmation-queue.service';

function setup() {
  const bookings = {
    skipCountdown: jest.fn().mockResolvedValue(undefined),
    process: jest.fn(),
    notifyState: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    transportRequest: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        assignedDriverId: null,
        status: 'QUOTED',
      }),
    },
  };
  const requests = {
    finalizeAcceptedOfferPayment: jest.fn().mockResolvedValue(undefined),
  };
  const reservations = { reconcile: jest.fn().mockResolvedValue(undefined) };
  const service = new BookingConfirmationQueueService(
    {} as never,
    prisma as never,
    bookings as never,
    requests as never,
    reservations as never,
  );
  return { service, bookings, prisma, requests, reservations };
}

test('skip completes both card steps, assigns the driver, then notifies', async () => {
  const x = setup();
  x.bookings.process.mockResolvedValueOnce(null).mockResolvedValueOnce({
    confirmationState: 'CONFIRMED',
    customerId: 'customer',
  });
  await x.service.skipCountdown('customer', 'request');
  expect(x.bookings.skipCountdown).toHaveBeenCalledWith('customer', 'request');
  expect(x.bookings.process).toHaveBeenCalledTimes(2);
  expect(x.requests.finalizeAcceptedOfferPayment).toHaveBeenCalledWith({
    customerId: 'customer',
    requestId: 'request',
  });
  expect(x.bookings.notifyState.mock.invocationCallOrder[1]).toBeGreaterThan(
    x.requests.finalizeAcceptedOfferPayment.mock.invocationCallOrder[0],
  );
});

test('skip does not assign a driver before bank approval secures the funds', async () => {
  const x = setup();
  x.bookings.process.mockResolvedValue(null);
  await x.service.skipCountdown('customer', 'request');
  expect(x.requests.finalizeAcceptedOfferPayment).not.toHaveBeenCalled();
  expect(x.reservations.reconcile).not.toHaveBeenCalled();
});

test('skip uses reservation reconciliation for an advance booking', async () => {
  const x = setup();
  x.prisma.transportRequest.findUniqueOrThrow.mockResolvedValue({
    deferredPaymentState: 'PENDING',
  });
  x.bookings.process.mockResolvedValue({
    confirmationState: 'CONFIRMED',
    customerId: 'customer',
  });
  await x.service.skipCountdown('customer', 'request');
  expect(x.reservations.reconcile).toHaveBeenCalledWith('request');
  expect(x.requests.finalizeAcceptedOfferPayment).not.toHaveBeenCalled();
});

test('skip wakes a queued countdown so bank approval can continue without the original delay', async () => {
  const x = setup();
  x.bookings.process.mockResolvedValue(null);
  const job = {
    getState: jest.fn().mockResolvedValue('delayed'),
    promote: jest.fn().mockResolvedValue(undefined),
  };
  const queue = { getJob: jest.fn().mockResolvedValue(job) };
  Object.assign(x.service, { queue });
  await x.service.skipCountdown('customer', 'request');
  expect(queue.getJob).toHaveBeenCalledWith('booking-request');
  expect(job.promote).toHaveBeenCalledTimes(1);
});
