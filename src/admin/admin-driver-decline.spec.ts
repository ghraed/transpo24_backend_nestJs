import { BadRequestException } from '@nestjs/common';
import {
  DocumentStatus,
  DriverStatus,
  DriverVehicleReviewStatus,
} from '@prisma/client';

import { AdminService } from './admin.service';

const document = (
  id: string,
  type: string,
  vehicleId: string | null = null,
) => ({
  id,
  type,
  vehicleId,
  status: DocumentStatus.UNDER_REVIEW,
  createdAt: new Date('2026-01-01'),
});

function setup() {
  const profile = {
    id: 'driver-1',
    status: DriverStatus.PENDING_REVIEW,
    submittedForReviewAt: new Date('2026-01-01'),
    reviewVehicleId: 'vehicle-1',
    userId: 'driver-user-1',
    documents: [
      document('selfie-1', 'PERSONAL_SELFIE'),
      document('id-front-1', 'ID_FRONT'),
    ],
    vehicles: [
      {
        id: 'vehicle-1',
        status: DriverVehicleReviewStatus.PENDING_REVIEW,
        documents: [
          document('front-1', 'VEHICLE_FRONT_PHOTO', 'vehicle-1'),
          document('rear-1', 'VEHICLE_REAR_PHOTO', 'vehicle-1'),
        ],
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
    notifyDriverReviewDeclined: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AdminService(
    prisma as never,
    notifications as never,
    {} as never,
  );
  jest.spyOn(service, 'findDriverReviewById').mockResolvedValue({} as never);
  return { profile, prisma, service, notifications };
}

describe('selective driver review declines', () => {
  it('rejects only the selected personal document and leaves vehicle status untouched', async () => {
    const { prisma, service, notifications } = setup();
    await service.declineDriverReview('driver-1', 'Blurry ID.', ['id-front-1']);
    expect(notifications.notifyDriverReviewDeclined).toHaveBeenCalledWith({
      driverUserId: 'driver-user-1',
    });
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { status: DriverStatus.REJECTED },
    });
    expect(prisma.driverDocument.updateMany).toHaveBeenCalledWith({
      where: { driverId: 'driver-1', id: { in: ['id-front-1'] } },
      data: {
        status: DocumentStatus.REJECTED,
        rejectionReason: 'Blurry ID.',
        reviewedAt: expect.any(Date),
      },
    });
    expect(prisma.driverVehicle.update).not.toHaveBeenCalled();
  });

  it('rejects a selected vehicle document and marks only its vehicle for correction', async () => {
    const { prisma, service } = setup();
    await service.declineDriverReview('driver-1', 'Plate is unreadable.', [
      'front-1',
    ]);
    expect(prisma.driverDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId: 'driver-1', id: { in: ['front-1'] } },
      }),
    );
    expect(prisma.driverVehicle.update).toHaveBeenCalledWith({
      where: { id: 'vehicle-1' },
      data: {
        status: DriverVehicleReviewStatus.REJECTED,
        rejectionReason: 'Plate is unreadable.',
        isActive: false,
      },
    });
  });

  it('reviews the pinned vehicle when other vehicles appear first', async () => {
    const { profile, prisma, service } = setup();
    profile.vehicles.unshift({
      id: 'other-vehicle',
      status: DriverVehicleReviewStatus.PENDING_REVIEW,
      documents: [
        document('other-front', 'VEHICLE_FRONT_PHOTO', 'other-vehicle'),
      ],
    });
    await service.declineDriverReview('driver-1', 'Plate is unreadable.', [
      'front-1',
    ]);
    expect(prisma.driverVehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vehicle-1' },
      }),
    );
  });

  it('does not let an older document version be declined after a replacement was uploaded', async () => {
    const { profile, prisma, service } = setup();
    profile.documents.unshift(document('id-front-2', 'ID_FRONT'));
    await expect(
      service.declineDriverReview('driver-1', 'Bad file.', ['id-front-1']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.driverDocument.updateMany).not.toHaveBeenCalled();
  });

  it('does not reject legacy files that the driver cannot replace in onboarding', async () => {
    const { profile, prisma, service } = setup();
    profile.documents.push(document('legacy-1', 'IDENTITY_DOCUMENT'));
    await expect(
      service.declineDriverReview('driver-1', 'Bad file.', ['legacy-1']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.driverDocument.updateMany).not.toHaveBeenCalled();
  });

  it('blocks approval while a selected personal document remains rejected', async () => {
    const { profile, prisma, service } = setup();
    profile.documents.push(document('id-back-1', 'ID_BACK'));
    profile.documents.push(document('license-1', 'DRIVING_LICENSE'));
    profile.documents[1].status = DocumentStatus.REJECTED;
    await expect(
      service.approveDriverReviewVehicle('driver-1', 'vehicle-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks approval of a different vehicle while the pinned review is pending', async () => {
    const { profile, prisma, service } = setup();
    profile.vehicles.push({
      id: 'other-vehicle',
      status: DriverVehicleReviewStatus.PENDING_REVIEW,
      documents: [
        document('other-front', 'VEHICLE_FRONT_PHOTO', 'other-vehicle'),
      ],
    });
    await expect(
      service.approveDriverReviewVehicle('driver-1', 'other-vehicle'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks approval of a declined driver until corrections are resubmitted', async () => {
    const { profile, prisma, service } = setup();
    profile.status = DriverStatus.REJECTED;
    await expect(
      service.approveDriverReview('driver-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects missing, duplicate, or unrelated document IDs before writing', async () => {
    const { prisma, service } = setup();
    for (const ids of [[], ['selfie-1', 'selfie-1'], ['another-driver-doc']]) {
      await expect(
        service.declineDriverReview('driver-1', 'Bad file.', ids),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
    expect(prisma.driverDocument.updateMany).not.toHaveBeenCalled();
  });
});
