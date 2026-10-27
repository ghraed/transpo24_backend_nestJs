import {
  DocumentStatus,
  DriverDocumentType,
  DriverEarningStatus,
  DriverStatus,
} from '@prisma/client';

import { DriverService } from './driver.service';

describe('DriverService', () => {
  const service = new DriverService({} as never, {} as never, {} as never);

  it('releases due pending driver earnings into available balance', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const serviceWithPrisma = new DriverService(
      { driverEarning: { updateMany } } as never,
      {} as never,
      {} as never,
    );

    await (
      serviceWithPrisma as unknown as {
        releaseAvailableDriverEarnings(driverId: string): Promise<void>;
      }
    ).releaseAvailableDriverEarnings('driver-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        driverId: 'driver-1',
        status: DriverEarningStatus.PENDING,
        availableAt: { lte: expect.any(Date) },
      },
      data: {
        status: DriverEarningStatus.AVAILABLE,
      },
    });
  });

  it('disables submit for review when a required onboarding document is expired', () => {
    const profile = {
      id: 'driver-1',
      userId: 'user-1',
      firstName: 'Test',
      lastName: 'Driver',
      phone: '+96170000000',
      countryCode: null,
      countryCodes: [],
      city: null,
      cities: [],
      coverageAreas: [],
      fullNameOnId: 'Test Driver',
      dateOfBirth: null,
      idOrResidencyNumber: null,
      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      preferredLanguages: [],
      emergencyContactName: null,
      emergencyContactPhone: null,
      profilePhotoUrl: null,
      identityDocumentKind: null,
      submittedForReviewAt: null,
      status: DriverStatus.PENDING_DOCUMENTS,
      isProfileCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const documents = [
      {
        id: 'doc-selfie',
        vehicleId: null,
        type: DriverDocumentType.PERSONAL_SELFIE,
        url: '/uploads/selfie.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
        status: DocumentStatus.UPLOADED,
        rejectionReason: null,
        expiresAt: null,
        reviewedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'doc-id-front',
        vehicleId: null,
        type: DriverDocumentType.ID_FRONT,
        url: '/uploads/id-front.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
        status: DocumentStatus.UPLOADED,
        rejectionReason: null,
        expiresAt: new Date('2025-01-01T00:00:00.000Z'),
        reviewedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'doc-id-back',
        vehicleId: null,
        type: DriverDocumentType.ID_BACK,
        url: '/uploads/id-back.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
        status: DocumentStatus.UPLOADED,
        rejectionReason: null,
        expiresAt: new Date('2025-01-01T00:00:00.000Z'),
        reviewedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'doc-license',
        vehicleId: null,
        type: DriverDocumentType.DRIVING_LICENSE,
        url: '/uploads/driving-license.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
        status: DocumentStatus.UPLOADED,
        rejectionReason: null,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        reviewedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    const response = (
      service as unknown as {
        toOnboardingDocumentsStatusResponse(
          profileInput: typeof profile,
          documentsInput: typeof documents,
        ): { canSubmitForReview: boolean };
      }
    ).toOnboardingDocumentsStatusResponse(profile, documents);

    expect(response.canSubmitForReview).toBe(false);
  });
});

describe('driver-facing customer identity', () => {
  const service = new DriverService({} as never, {} as never, {} as never);
  const mapper = service as unknown as {
    toRequestDetailsResponse: (...args: unknown[]) => {
      customerName: string;
      customer: { firstName: string };
    };
    toAcceptedJobDetailsResponse: (...args: unknown[]) => {
      customerName: string;
      customer: { firstName: string };
    };
    mapDriverRatingItemResponse: (item: unknown) => { customerName: string };
  };
  const request = {
    id: 'request-1',
    createdAt: new Date(),
    photos: [],
    customer: { name: 'Private Legal Name' },
    acceptedOffer: {
      id: 'offer-1',
      price: 20,
      createdAt: new Date(),
      updatedAt: new Date(),
      driver: { id: 'driver-1' },
    },
  };
  it('uses the full name in request details', () => {
    const result = mapper.toRequestDetailsResponse(
      request,
      { id: 'alert-1', createdAt: new Date() },
      null,
      null,
    );
    expect(result.customerName).toBe('Private Legal Name');
    expect(result.customer.firstName).toBe('Private Legal Name');
  });
  it('uses the name in accepted jobs and ratings', () => {
    const result = mapper.toAcceptedJobDetailsResponse(request);
    expect(result.customerName).toBe('Private Legal Name');
    expect(result.customer.firstName).toBe('Private Legal Name');
    expect(
      mapper.mapDriverRatingItemResponse({
        createdAt: new Date(),
        customer: request.customer,
      }).customerName,
    ).toBe('Private Legal Name');
  });
  it('uses the full name for customer ratings', () => {
    const result = mapper.mapDriverRatingItemResponse({
      id: 'rating-1',
      rating: 5,
      createdAt: new Date(),
      customer: { name: 'Private Legal Name' },
    });
    expect(result.customerName).toBe('Private Legal Name');
  });
});
