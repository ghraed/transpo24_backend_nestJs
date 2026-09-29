import { BadRequestException } from '@nestjs/common';
import {
  DocumentStatus,
  DriverDocumentType,
  DriverStatus,
  IdentityDocumentKind,
} from '@prisma/client';

import { DriverService } from './driver.service';

function setup(
  identityDocumentKind: IdentityDocumentKind = IdentityDocumentKind.NATIONAL_ID,
) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        driverProfile: {
          id: 'driver-1',
          isProfileCompleted: true,
          status: DriverStatus.PENDING_DOCUMENTS,
          identityDocumentKind,
        },
      }),
    },
    driverDocument: { updateMany },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    ),
  };
  const service = new DriverService(prisma as never, {} as never, {} as never);
  const status = { uploadedDocuments: [], missingDocuments: [] };
  jest
    .spyOn(service, 'getOnboardingDocumentsStatus')
    .mockResolvedValue(status as never);
  return { prisma, service, status, updateMany };
}

describe('driver onboarding document dates', () => {
  it('updates an uploaded licence expiry without uploading another photo', async () => {
    const { prisma, service, status, updateMany } = setup();
    const date = new Date('2030-01-01');

    await expect(
      service.updateOnboardingDocumentDates({
        userId: 'user-1',
        drivingLicenseExpiryDate: date,
      }),
    ).resolves.toBe(status);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        driverId: 'driver-1',
        vehicleId: null,
        type: DriverDocumentType.DRIVING_LICENSE,
        status: { not: DocumentStatus.REJECTED },
      },
      data: {
        expiresAt: date,
        status: DocumentStatus.UPLOADED,
        reviewedAt: null,
        rejectionReason: null,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('updates both sides of an existing residency card', async () => {
    const { service, updateMany } = setup(IdentityDocumentKind.RESIDENCY_CARD);
    const date = new Date('2030-01-01');
    await service.updateOnboardingDocumentDates({
      userId: 'user-1',
      idExpiryDate: date,
    });
    expect(
      updateMany.mock.calls.map(([request]) => request.where.type),
    ).toEqual([DriverDocumentType.ID_FRONT, DriverDocumentType.ID_BACK]);
  });

  it('does not set an expiry on missing or rejected documents', async () => {
    const { service, updateMany } = setup();
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateOnboardingDocumentDates({
        userId: 'user-1',
        drivingLicenseExpiryDate: new Date('2030-01-01'),
      }),
    ).rejects.toThrow('Upload the document before setting its expiry date.');
  });

  it('rejects date-only changes after review starts', async () => {
    const { prisma, service, updateMany } = setup();
    prisma.user.findUnique.mockResolvedValue({
      driverProfile: {
        id: 'driver-1',
        isProfileCompleted: true,
        status: DriverStatus.PENDING_REVIEW,
        identityDocumentKind: IdentityDocumentKind.NATIONAL_ID,
      },
    });
    await expect(
      service.updateOnboardingDocumentDates({
        userId: 'user-1',
        drivingLicenseExpiryDate: new Date('2030-01-01'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
