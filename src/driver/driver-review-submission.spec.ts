import { BadRequestException } from '@nestjs/common';
import {
  DocumentStatus,
  DriverDocumentType,
  DriverStatus,
  DriverVehicleReviewStatus,
  VehicleCargoType,
  VehicleType,
} from '@prisma/client';

import { DriverService } from './driver.service';

const personalTypes = [
  DriverDocumentType.PERSONAL_SELFIE,
  DriverDocumentType.ID_FRONT,
  DriverDocumentType.ID_BACK,
  DriverDocumentType.DRIVING_LICENSE,
];
const vehicleTypes = [
  DriverDocumentType.VEHICLE_FRONT_PHOTO,
  DriverDocumentType.VEHICLE_REAR_PHOTO,
  DriverDocumentType.VEHICLE_SIDE_PHOTO,
  DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO,
  DriverDocumentType.VEHICLE_REGISTRATION_FRONT,
  DriverDocumentType.VEHICLE_REGISTRATION_BACK,
  DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT,
];

function document(
  type: DriverDocumentType,
  status: DocumentStatus = DocumentStatus.UPLOADED,
  createdAt = new Date('2026-01-01'),
) {
  return {
    id: `${type}-${createdAt.toISOString()}`,
    vehicleId: null,
    type,
    url: '/file.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    status,
    rejectionReason: null,
    expiresAt: null,
    reviewedAt: null,
    createdAt,
  };
}

function completeVehicle() {
  return {
    id: 'vehicle-1',
    driverId: 'driver-1',
    status: DriverVehicleReviewStatus.PENDING_REVIEW,
    vehicleType: VehicleType.VAN,
    make: 'Test',
    model: 'Truck',
    year: 2025,
    plateNumber: 'ABC123',
    capacityKg: 1000,
    lengthCm: 300,
    widthCm: 200,
    heightCm: 180,
    allowedCargoTypes: [VehicleCargoType.GOODS],
    documents: vehicleTypes.map((type) => document(type)),
  };
}

function setup(vehicles: ReturnType<typeof completeVehicle>[]) {
  const profile = {
    id: 'driver-1',
    firstName: 'Test',
    lastName: 'Driver',
    isProfileCompleted: true,
    identityDocumentKind: null,
    status: DriverStatus.PENDING_DOCUMENTS,
    submittedForReviewAt: null,
  };
  const personalDocuments = personalTypes.map((type) => document(type));
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ driverProfile: profile }),
    },
    driverDocument: {
      findMany: jest.fn().mockResolvedValue(personalDocuments),
      updateMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    driverVehicle: { findMany: jest.fn().mockResolvedValue(vehicles) },
    driverProfile: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  const notifications = {
    notifyAdminsAboutDriverReviewSubmission: jest
      .fn()
      .mockResolvedValue(undefined),
  };
  const service = new DriverService(
    prisma as never,
    {} as never,
    notifications as never,
  );
  return { profile, prisma, notifications, service };
}

describe('driver review submission vehicle readiness', () => {
  it.each([
    ['no vehicle', []],
    [
      'a missing required vehicle document',
      [
        {
          ...completeVehicle(),
          documents: completeVehicle().documents.filter(
            (item) => item.type !== DriverDocumentType.VEHICLE_REAR_PHOTO,
          ),
        },
      ],
    ],
    [
      'a missing load-capacity profile',
      [{ ...completeVehicle(), capacityKg: null }],
    ],
    [
      'a newer rejected vehicle document',
      [
        {
          ...completeVehicle(),
          documents: [
            ...completeVehicle().documents,
            document(
              DriverDocumentType.VEHICLE_REAR_PHOTO,
              DocumentStatus.REJECTED,
              new Date('2026-01-02'),
            ),
          ],
        },
      ],
    ],
  ])(
    'rejects submission with %s before any writes',
    async (_scenario, vehicles) => {
      const { prisma, service } = setup(
        vehicles as ReturnType<typeof completeVehicle>[],
      );
      await expect(
        service.submitOnboardingDocumentsForReview({ userId: 'user-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.driverProfile.update).not.toHaveBeenCalled();
    },
  );

  it('submits when at least one reviewable vehicle is complete', async () => {
    const incomplete = {
      ...completeVehicle(),
      id: 'vehicle-incomplete',
      capacityKg: null,
    };
    const { prisma, notifications, service } = setup([
      incomplete,
      completeVehicle(),
    ]);
    const response = await service.submitOnboardingDocumentsForReview({
      userId: 'user-1',
    });
    expect(prisma.driverVehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          driverId: 'driver-1',
          status: {
            in: [
              DriverVehicleReviewStatus.PENDING_REVIEW,
              DriverVehicleReviewStatus.APPROVED,
            ],
          },
        },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: {
        status: DriverStatus.PENDING_REVIEW,
        submittedForReviewAt: expect.any(Date),
      },
    });
    expect(response.onboardingStatus).toBe(DriverStatus.PENDING_REVIEW);
    expect(
      notifications.notifyAdminsAboutDriverReviewSubmission,
    ).toHaveBeenCalledTimes(1);
  });
});
