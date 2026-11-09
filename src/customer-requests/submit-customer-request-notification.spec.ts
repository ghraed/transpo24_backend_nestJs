import { CustomerRequestsService } from './customer-requests.service';

describe('submitted request notifications', () => {
  it('sends to the matched driver before completing submission', async () => {
    const request = {
      id: 'request-1',
      customerId: 'customer-1',
      status: 'DRAFT',
    };
    const prisma = {
      transportRequest: {
        findUnique: jest.fn().mockResolvedValue(request),
        update: jest
          .fn()
          .mockResolvedValue({ ...request, status: 'PENDING_QUOTES' }),
      },
    };
    let finishNotification!: () => void;
    const notifyDriversAboutNewTransportRequest = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishNotification = resolve;
        }),
    );
    const service = new CustomerRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { notifyDriversAboutNewTransportRequest } as never,
    );
    const driverNotifications = [
      {
        userId: 'driver-user-1',
        requestId: 'request-1',
        serviceType: 'Goods',
        distanceKm: 2,
      },
    ];
    Object.assign(service, {
      validateSubmittedRequest: jest.fn(),
      dispatchSubmittedRequestToEligibleDrivers: jest.fn().mockResolvedValue({
        summary: { eligibleDriversCount: 1 },
        driverNotifications,
      }),
      toResponseDto: jest.fn().mockReturnValue({ id: 'request-1' }),
    });

    let completed = false;
    const submission = service
      .submitCustomerRequest({
        requestId: 'request-1',
        customerId: 'customer-1',
      })
      .then((result) => {
        completed = true;
        return result;
      });
    await new Promise((resolve) => setImmediate(resolve));

    expect(notifyDriversAboutNewTransportRequest).toHaveBeenCalledWith({
      drivers: driverNotifications,
    });
    expect(completed).toBe(false);

    finishNotification();
    await expect(submission).resolves.toEqual({ id: 'request-1' });
  });
});
