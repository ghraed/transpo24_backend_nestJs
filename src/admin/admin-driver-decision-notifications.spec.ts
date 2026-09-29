import { BadRequestException } from '@nestjs/common';
import {
  DocumentStatus,
  DriverStatus,
  DriverVehicleReviewStatus,
  VehicleType,
} from '@prisma/client';

import { AdminService } from './admin.service';

const personalTypes = [
  'PERSONAL_SELFIE',
  'ID_FRONT',
  'ID_BACK',
  'DRIVING_LICENSE',
] as const;
const vehicleTypes = [
  'VEHICLE_FRONT_PHOTO',
  'VEHICLE_REAR_PHOTO',
  'VEHICLE_SIDE_PHOTO',
  'VEHICLE_LICENSE_PLATE_PHOTO',
  'VEHICLE_REGISTRATION_FRONT',
  'VEHICLE_REGISTRATION_BACK',
  'VEHICLE_INSURANCE_DOCUMENT',
] as const;

function setup(status: DriverStatus = DriverStatus.PENDING_REVIEW) {
  const document = (type: string, vehicleId: string | null = null) => ({
    id: type,
    type,
    vehicleId,
    status: DocumentStatus.UNDER_REVIEW,
    createdAt: new Date('2026-01-01'),
  });
  const profile = {
    id: 'driver-1',
    userId: 'driver-user-1',
    user: { name: 'Driver One', email: 'driver@example.com' },
    status,
    submittedForReviewAt: new Date('2026-01-01'),
    reviewVehicleId: 'vehicle-1',
    documents: personalTypes.map((type) => document(type)),
    vehicles: [
      {
        id: 'vehicle-1',
        status: DriverVehicleReviewStatus.PENDING_REVIEW,
        vehicleType: VehicleType.FLATBED_OPEN,
        allowedCargoTypes: ['GENERAL'],
        capacityKg: null,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
        documents: vehicleTypes.map((type) => document(type, 'vehicle-1')),
      },
    ],
  };
  const prisma = {
    driverProfile: {
      findUnique: jest.fn().mockResolvedValue(profile),
      update: jest.fn().mockResolvedValue({}),
    },
    driverDocument: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    driverVehicle: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  const notifications = {
    notifyDriverApproved: jest.fn().mockResolvedValue(undefined),
    notifyDriverReviewDeclined: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AdminService(
    prisma as never,
    notifications as never,
    {} as never,
  );
  jest.spyOn(service, 'findDriverReviewById').mockResolvedValue({} as never);
  return { profile, prisma, notifications, service };
}

describe('admin driver review decision notifications', () => {
  it.each([
    [
      'driver approval',
      (service: AdminService) => service.approveDriverReview('driver-1'),
    ],
    [
      'submitted vehicle approval',
      (service: AdminService) =>
        service.approveDriverReviewVehicle('driver-1', 'vehicle-1'),
    ],
  ])('waits for the driver notification after %s', async (_label, approve) => {
    const { service, prisma, notifications } = setup();
    let finishNotification!: () => void;
    notifications.notifyDriverApproved.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishNotification = resolve;
        }),
    );

    let completed = false;
    const action = approve(service).then(() => {
      completed = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifications.notifyDriverApproved).toHaveBeenCalledWith({
      driverUserId: 'driver-user-1',
      driverName: 'Driver One',
    });
    expect(completed).toBe(false);

    finishNotification();
    await action;
    expect(completed).toBe(true);
  });

  it('does not repeat an approval notification for an already approved driver', async () => {
    const { service, notifications } = setup(DriverStatus.APPROVED);
    await service.approveDriverReview('driver-1');
    await service.approveDriverReviewVehicle('driver-1', 'vehicle-1');
    expect(notifications.notifyDriverApproved).not.toHaveBeenCalled();
  });

  it('waits for the decline notification after saving the rejected review', async () => {
    const { service, prisma, notifications } = setup();
    let finishNotification!: () => void;
    notifications.notifyDriverReviewDeclined.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishNotification = resolve;
        }),
    );

    let completed = false;
    const action = service
      .declineDriverReview('driver-1', 'Replace your ID.', ['ID_FRONT'])
      .then(() => {
        completed = true;
      });
    await new Promise((resolve) => setImmediate(resolve));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifications.notifyDriverReviewDeclined).toHaveBeenCalledWith({
      driverUserId: 'driver-user-1',
    });
    expect(completed).toBe(false);

    finishNotification();
    await action;
    expect(completed).toBe(true);
  });

  it('keeps the saved decision when push dispatch fails', async () => {
    const { service, prisma, notifications } = setup();
    notifications.notifyDriverApproved.mockRejectedValue(
      new Error('Push unavailable'),
    );

    await expect(service.approveDriverReview('driver-1')).resolves.toEqual({});
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifications.notifyDriverApproved).toHaveBeenCalledTimes(1);
  });

  it('does not send a decision notification when the review is invalid', async () => {
    const { service, notifications } = setup(DriverStatus.REJECTED);
    await expect(
      service.approveDriverReview('driver-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.declineDriverReview('driver-1', 'Replace your ID.', ['ID_FRONT']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notifications.notifyDriverApproved).not.toHaveBeenCalled();
    expect(notifications.notifyDriverReviewDeclined).not.toHaveBeenCalled();
  });
});
