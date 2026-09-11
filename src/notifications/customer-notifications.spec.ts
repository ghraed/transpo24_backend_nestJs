import { PushApp } from '@prisma/client';
import { NotificationsService } from './notifications.service';

function setup() {
  const customerNotification = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    findFirst: jest.fn().mockResolvedValue({ id: 'n1' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(2),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const pushToken = { findMany: jest.fn().mockResolvedValue([]) };
  const transportRequest = {
    findUnique: jest.fn().mockResolvedValue({ customerId: 'payer' }),
  };
  const service = new NotificationsService(
    { customerNotification, pushToken, transportRequest } as never,
    {} as never,
  );
  return { service, customerNotification, pushToken, transportRequest };
}

const input = {
  userIds: ['payer', 'payer'],
  app: PushApp.CUSTOMER,
  type: 'DRIVER_ARRIVED_PICKUP',
  title: 'Driver reached pickup',
  body: 'Your driver arrived.',
  data: { tripId: 'trip1' },
};

describe('Customer Alerts history', () => {
  it('saves one unread update without a registered push device', async () => {
    const { service, customerNotification, pushToken } = setup();
    await service.sendToUsers(input);
    expect(customerNotification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'payer',
          type: input.type,
          title: input.title,
          body: input.body,
          data: input.data,
          eventKey: 'DRIVER_ARRIVED_PICKUP:trip1',
        },
      ],
      skipDuplicates: true,
    });
    expect(
      customerNotification.createMany.mock.invocationCallOrder[0],
    ).toBeLessThan(pushToken.findMany.mock.invocationCallOrder[0]);
  });
  it('keeps saved history when the push provider fails', async () => {
    const { service, customerNotification, pushToken } = setup();
    pushToken.findMany.mockRejectedValue(new Error('Push unavailable'));
    await expect(service.sendToUsers(input)).resolves.toBeUndefined();
    expect(customerNotification.createMany).toHaveBeenCalled();
  });
  it('does not send a duplicate milestone push after an HTTP retry', async () => {
    const { service, customerNotification, pushToken } = setup();
    customerNotification.createMany.mockResolvedValue({ count: 0 });
    await service.sendToUsers(input);
    expect(pushToken.findMany).not.toHaveBeenCalled();
  });
  it('does not merge distinct chat messages for the same trip', async () => {
    const { service, customerNotification } = setup();
    await service.sendToUsers({ ...input, type: 'CHAT_MESSAGE' });
    expect(
      customerNotification.createMany.mock.calls[0][0].data[0].eventKey,
    ).toBeNull();
  });
  it('does not save driver-only notifications in the customer feed', async () => {
    const { service, customerNotification } = setup();
    await service.sendToUsers({ ...input, app: PushApp.DRIVER });
    expect(customerNotification.createMany).not.toHaveBeenCalled();
  });
  it('paginates and counts unread notifications only for the authenticated customer', async () => {
    const { service, customerNotification } = setup();
    customerNotification.findMany.mockResolvedValue(
      Array.from({ length: 16 }, (_, i) => ({ id: `n${i}` })),
    );
    const page = await service.listCustomerNotifications('payer', 'cursor1');
    expect(page.items).toHaveLength(15);
    expect(page.nextCursor).toBe('n14');
    expect(page.unreadCount).toBe(2);
    expect(customerNotification.findFirst).toHaveBeenCalledWith({
      where: { id: 'cursor1', userId: 'payer' },
      select: { id: true },
    });
    expect(customerNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'payer' },
        cursor: { id: 'cursor1' },
        skip: 1,
        take: 16,
      }),
    );
    expect(customerNotification.count).toHaveBeenCalledWith({
      where: { userId: 'payer', readAt: null },
    });
  });
  it('filters the database query and cursor by the requested start time', async () => {
    const { service, customerNotification } = setup();
    const since = '2026-09-11T00:00:00.000Z';
    await service.listCustomerNotifications('payer', 'cursor1', since);
    expect(customerNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'payer', createdAt: { gte: new Date(since) } },
        take: 16,
      }),
    );
    expect(customerNotification.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'cursor1',
        userId: 'payer',
        createdAt: { gte: new Date(since) },
      },
      select: { id: true },
    });
  });
  it('does not advertise another page when the result is exactly one batch', async () => {
    const { service, customerNotification } = setup();
    customerNotification.findMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({ id: `n${i}` })),
    );
    const result = await service.listCustomerNotifications('payer');
    expect(result.items).toHaveLength(15);
    expect(result.nextCursor).toBeNull();
  });
  it('rejects another customer’s pagination cursor', async () => {
    const { service, customerNotification } = setup();
    customerNotification.findFirst.mockResolvedValue(null);
    await expect(
      service.listCustomerNotifications('payer', 'foreign'),
    ).rejects.toThrow('Invalid notification cursor');
    expect(customerNotification.findMany).not.toHaveBeenCalled();
  });
  it('cannot mark another customer’s notification as read', async () => {
    const { service, customerNotification } = setup();
    customerNotification.findFirst.mockResolvedValue(null);
    await expect(
      service.markCustomerNotificationRead('payer', 'foreign'),
    ).rejects.toThrow('Notification not found');
    expect(customerNotification.updateMany).not.toHaveBeenCalled();
  });
  it('preserves the first read timestamp on repeat reads', async () => {
    const { service, customerNotification } = setup();
    await service.markCustomerNotificationRead('payer', 'n1');
    expect(customerNotification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'payer', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
  it.each([
    'DRIVER_GOING_TO_PICKUP',
    'DRIVER_ARRIVED_PICKUP',
    'DRIVER_GOING_TO_DROPOFF',
    'DRIVER_NEAR_DELIVERY',
    'CUSTOMER_DELIVERY_CONFIRMED',
    'TRIP_CANCELLED',
  ])('addresses %s to the trip owner', async (type) => {
    const { service, customerNotification } = setup();
    await service.notifyCustomerTripUpdate('trip1', type);
    expect(customerNotification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            userId: 'payer',
            type,
            data: { tripId: 'trip1', requestId: 'trip1' },
          }),
        ],
      }),
    );
  });
});
