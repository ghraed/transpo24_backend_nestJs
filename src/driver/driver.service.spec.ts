import {
  DocumentStatus,
  DriverDocumentType,
  DriverStatus,
} from '@prisma/client';

import { DriverService } from './driver.service';

describe('DriverService', () => {
  const service = new DriverService({} as never, {} as never, {} as never);

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
      preferredLanguage: null,
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
