import { Prisma } from '@prisma/client';
import { FurnitureReservationsService } from './furniture-reservations.service';
import { HOUR } from './furniture-reservation-policy';

// Model persistence and serialized transactions; Stripe is exercised by PaymentsService tests.
describe.each(['FURNITURE_TRANSPORT'])(
  '%s deferred reservation lifecycle',
  (serviceKey) => {
    let row: any;
    let prisma: any;
    let payments: any;
    let notifications: any;
    let service: FurnitureReservationsService;
    const pickup = new Date('2026-11-10T10:00:00Z');
    const input = {
      customerId: 'customer',
      requestId: 'request',
      offerId: 'offer',
      supportsDeferredFurniture: true,
      supportsDeferredVehicle: true,
    };
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-17T10:00:00Z'));
      const driver = {
        id: 'driver',
        userId: 'driver-user',
        status: 'APPROVED',
        isProfileCompleted: true,
        vehicles: [{ id: 'vehicle' }],
        availability: { isOnline: false },
      };
      const offer = {
        id: 'offer',
        requestId: 'request',
        driverId: 'driver',
        status: 'PENDING',
        price: new Prisma.Decimal(100),
        currency: 'CHF',
        estimatedPickupAt: pickup,
        estimatedDeliveryAt: null,
        estimatedDurationMinutes: null,
        message: null,
        acceptedAt: null,
        createdAt: new Date(),
        driver,
      };
      row = {
        id: 'request',
        customerId: 'customer',
        service: { key: serviceKey },
        scheduledPickupAt: pickup,
        scheduleTimeZone: 'UTC',
        status: 'QUOTED',
        acceptedOfferId: null,
        assignedDriverId: null,
        paymentHoldId: null,
        deferredPaymentState: null,
        acceptedOffer: offer,
        assignedDriver: driver,
        paymentHold: null,
        reservationSelectedNotifiedAt: null,
        reservationReminderSentAt: null,
        reservationCancellationNotifiedAt: null,
        reservationPaymentNotifiedAt: null,
        reservationRefundedAt: null,
      };
      const transportRequest = {
        findUnique: jest.fn(async () => row),
        findUniqueOrThrow: jest.fn(async () => row),
        update: jest.fn(async ({ data }: any) => {
          Object.assign(row, data);
          return row;
        }),
        findMany: jest.fn(async () => [{ id: row.id }]),
      };
      const tx = {
        $queryRaw: jest.fn(async () => []),
        transportRequest,
        driverOffer: {
          findUnique: jest.fn(async () => offer),
          update: jest.fn(async ({ data }: any) => Object.assign(offer, data)),
          updateMany: jest.fn(async () => ({ count: 1 })),
        },
        paymentHold: {
          update: jest.fn(async ({ data }: any) =>
            Object.assign(row.paymentHold, data),
          ),
        },
      };
      let tail = Promise.resolve();
      prisma = {
        ...tx,
        $transaction: jest.fn((fn: any) => {
          const result = tail.then(() => fn(tx));
          tail = result.catch(() => undefined);
          return result;
        }),
      };
      payments = {
        createHoldForAcceptedOffer: jest.fn(async (_tx: any, data: any) => {
          row.paymentHold = {
            id: 'hold',
            ...data,
            status:
              data.paymentMethod === 'APP_WALLET'
                ? 'PAYMENT_CAPTURED'
                : 'PAYMENT_HOLD_PENDING',
          };
          return row.paymentHold;
        }),
        getRequestPayment: jest.fn(async () => row.paymentHold),
        cancelRequestPayment: jest.fn(async () => {
          row.paymentHold.status = 'PAYMENT_RELEASED';
        }),
        refundUnpaidReservation: jest.fn(async () => {
          row.paymentHold.status = 'PAYMENT_REFUNDED';
        }),
      };
      notifications = { sendToUsers: jest.fn(async () => undefined) };
      service = new FurnitureReservationsService(
        prisma as never,
        payments as never,
        notifications as never,
        {
          get: (key: string) =>
            [
              'FURNITURE_RESERVATIONS_ENABLED',
              'VEHICLE_RESERVATIONS_ENABLED',
            ].includes(key)
              ? 'true'
              : undefined,
        } as never,
        { ensureRoomForAcceptedOffer: jest.fn() } as never,
      );
      (service as any).ready = true;
    });
    afterEach(() => jest.useRealTimers());
    const reserve = () => service.tryReserve(input);
    const open = () =>
      jest.setSystemTime(new Date(pickup.getTime() - 48 * HOUR));
    const confirm = (paymentMethod = 'CREDIT_CARD') =>
      service.confirm({
        ...input,
        confirm: true,
        paymentMethod: paymentMethod as any,
      });
    it('finds only this customer’s unpaid furniture reservations inside the confirmation window', async () => {
      prisma.transportRequest.findMany.mockResolvedValue([
        {
          id: 'request',
          scheduledPickupAt: pickup,
          paymentDeadlineAt: new Date('2026-11-09T10:00:00Z'),
          acceptedOffer: {
            id: 'offer',
            price: new Prisma.Decimal(100),
            currency: 'CHF',
          },
        },
      ]);
      const due = await service.paymentDue('customer');
      expect(prisma.transportRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 'customer',
            status: 'RESERVED',
            reservationPaidAt: null,
            service: { key: 'FURNITURE_TRANSPORT' },
            confirmationOpensAt: { lte: new Date() },
            paymentDeadlineAt: { gt: new Date() },
          }),
        }),
      );
      expect(due[0]).toMatchObject({
        requestId: 'request',
        offerId: 'offer',
        price: 100,
        currency: 'CHF',
      });
    });
    it('reserves exclusively while an approved driver is offline, without charging or reserving wallet funds', async () => {
      const result = await reserve();
      expect(result?.nextStep).toBe('RESERVATION_CONFIRMED');
      expect(result?.payment).toBeNull();
      expect(row.status).toBe('RESERVED');
      expect(row.assignedDriverId).toBe('driver');
      expect(row.acceptedOffer.status).toBe('ACCEPTED');
      expect(prisma.driverOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REJECTED' }),
        }),
      );
      expect(payments.createHoldForAcceptedOffer).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
    it('is idempotent and rejects competing offers', async () => {
      await reserve();
      await reserve();
      expect(prisma.driverOffer.update).toHaveBeenCalledTimes(1);
      await expect(
        service.tryReserve({ ...input, offerId: 'another' }),
      ).rejects.toThrow('different offer');
    });
    it('requires compatible clients and an operational scheduler', async () => {
      expect(
        await service.tryReserve({
          ...input,
          supportsDeferredFurniture: false,
          supportsDeferredVehicle: false,
        }),
      ).toBeNull();
      (service as any).ready = false;
      await expect(reserve()).rejects.toThrow('temporarily unavailable');
      expect(payments.createHoldForAcceptedOffer).not.toHaveBeenCalled();
    });
    it('uses an independent activation flag for this service', async () => {
      (service as any).config.get = (key: string) =>
        key ===
        (serviceKey === 'VEHICLE_TRANSPORT'
          ? 'VEHICLE_RESERVATIONS_ENABLED'
          : 'FURNITURE_RESERVATIONS_ENABLED')
          ? 'true'
          : 'false';
      await expect(reserve()).resolves.toMatchObject({
        nextStep: 'RESERVATION_CONFIRMED',
        payment: null,
      });
    });
    it.each(['VEHICLE_TRANSPORT', 'GOODS_TRANSPORT'])(
      'keeps %s on the immediate-payment path even with deferred capability',
      async (key) => {
        row.service.key = key;
        expect(await reserve()).toBeNull();
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(row.status).toBe('QUOTED');
      },
    );
    it('preserves the immediate-payment path for near pickups', async () => {
      row.scheduledPickupAt = new Date(Date.now() + 5 * 24 * HOUR);
      expect(await reserve()).toBeNull();
    });
    it('enforces ownership, driver approval and confirmation window', async () => {
      await expect(
        service.tryReserve({ ...input, customerId: 'other' }),
      ).rejects.toThrow('another customer');
      await reserve();
      await expect(confirm()).rejects.toThrow('48 until 24');
      open();
      row.assignedDriver.status = 'SUSPENDED';
      await expect(confirm()).rejects.toThrow('no longer eligible');
      expect(payments.createHoldForAcceptedOffer).not.toHaveBeenCalled();
    });
    it('collects wallet payment only after explicit confirmation and creates scheduled assignment', async () => {
      await reserve();
      open();
      const result = await confirm('APP_WALLET');
      expect(result.nextStep).toBe('TRACK_REQUEST');
      expect(row.status).toBe('DRIVER_ASSIGNED');
      expect(row.deferredPaymentState).toBe('PAID');
      expect(row.reservationPaidAt).toBeInstanceOf(Date);
      await confirm('APP_WALLET');
      expect(payments.createHoldForAcceptedOffer).toHaveBeenCalledTimes(1);
    });
    it('keeps authentication and failed payments retryable without a second intent', async () => {
      await reserve();
      open();
      await confirm();
      expect(row.status).toBe('RESERVED');
      row.paymentHold.status = 'PAYMENT_FAILED';
      await confirm();
      expect(payments.createHoldForAcceptedOffer).toHaveBeenCalledTimes(1);
      row.paymentHold.status = 'PAYMENT_CAPTURED';
      await service.finalize('customer', 'request');
      expect(row.status).toBe('DRIVER_ASSIGNED');
    });
    it('sends a single durable reminder at 48 hours, without charging', async () => {
      await reserve();
      open();
      notifications.sendToUsers.mockClear();
      await service.sweep();
      await service.sweep();
      expect(notifications.sendToUsers).toHaveBeenCalledTimes(1);
      expect(notifications.sendToUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          type:
            serviceKey === 'VEHICLE_TRANSPORT'
              ? 'VEHICLE_CONFIRMATION_DUE'
              : 'FURNITURE_CONFIRMATION_DUE',
        }),
      );
      expect(payments.createHoldForAcceptedOffer).not.toHaveBeenCalled();
    });
    it('retries notification failures after worker recovery', async () => {
      await reserve();
      open();
      notifications.sendToUsers.mockRejectedValueOnce(
        new Error('push unavailable'),
      );
      await service.sweep();
      expect(row.reservationReminderSentAt).toBeNull();
      await service.sweep();
      expect(row.reservationReminderSentAt).toBeInstanceOf(Date);
    });
    it('expires exactly at 24 hours, releases the driver and never charges cancellation fees', async () => {
      await reserve();
      jest.setSystemTime(new Date(pickup.getTime() - 24 * HOUR));
      await service.sweep();
      expect(row.status).toBe('CANCELLED');
      expect(row.assignedDriverId).toBeNull();
      expect(row.deferredPaymentState).toBe('EXPIRED');
      expect(payments.createHoldForAcceptedOffer).not.toHaveBeenCalled();
      await expect(confirm()).rejects.toThrow('48 until 24');
    });
    it('cancels unpaid reservations freely and refunds payment success arriving afterward', async () => {
      await reserve();
      open();
      await confirm();
      await service.cancel('customer', 'request');
      expect(row.status).toBe('CANCELLED');
      row.paymentHold.status = 'PAYMENT_CAPTURED';
      await service.reconcile('request');
      await service.reconcile('request');
      expect(payments.refundUnpaidReservation).toHaveBeenCalledTimes(1);
      expect(row.status).toBe('CANCELLED');
    });
    it('refunds payment captured after the deadline and does not create an active trip', async () => {
      await reserve();
      open();
      await confirm();
      jest.setSystemTime(new Date(pickup.getTime() - 24 * HOUR));
      row.paymentHold.status = 'PAYMENT_CAPTURED';
      await service.reconcile('request');
      expect(row.status).toBe('CANCELLED');
      expect(payments.refundUnpaidReservation).toHaveBeenCalledTimes(1);
    });
    it('preserves timely captured payment when finalization is recovered after the deadline', async () => {
      await reserve();
      open();
      await confirm();
      row.paymentHold.status = 'PAYMENT_CAPTURED';
      row.paymentHold.capturedAt = new Date();
      jest.setSystemTime(new Date(pickup.getTime() - 23 * HOUR));
      await service.reconcile('request');
      expect(row.deferredPaymentState).toBe('PAID');
      expect(payments.refundUnpaidReservation).not.toHaveBeenCalled();
    });
    it('refunds a captured payment if the reserved driver becomes ineligible', async () => {
      await reserve();
      open();
      await confirm();
      row.paymentHold.status = 'PAYMENT_CAPTURED';
      row.assignedDriver.status = 'SUSPENDED';
      await service.reconcile('request');
      expect(row.status).toBe('CANCELLED');
      expect(payments.refundUnpaidReservation).toHaveBeenCalledTimes(1);
    });
    it('does not retroactively expire a paid booking', async () => {
      await reserve();
      open();
      await confirm('APP_WALLET');
      jest.setSystemTime(new Date(pickup.getTime() + HOUR));
      await service.reconcile('request');
      expect(row.deferredPaymentState).toBe('PAID');
      expect(row.status).toBe('DRIVER_ASSIGNED');
    });
  },
);
