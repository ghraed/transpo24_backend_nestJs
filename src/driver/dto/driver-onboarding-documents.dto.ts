import {
  DocumentStatus,
  DriverDocumentType,
  DriverStatus,
  IdentityDocumentKind,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
} from 'class-validator';

export class UploadDriverOnboardingDocumentsDto {
  @IsOptional()
  @IsEnum(IdentityDocumentKind)
  idDocumentKind?: IdentityDocumentKind;

  @IsOptional()
  @IsDateString()
  idExpiryDate?: string;

  @IsOptional()
  @IsDateString()
  drivingLicenseExpiryDate?: string;
}

export interface DriverOnboardingDocumentResponseDto {
  id: string;
  type: DriverDocumentType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionReason: string | null;
  expiresAt: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
}

export interface DriverOnboardingDocumentsStatusResponseDto {
  onboardingStatus: DriverStatus;
  identityDocumentKind: IdentityDocumentKind | null;
  requiredDocuments: DriverDocumentType[];
  uploadedDocuments: DriverOnboardingDocumentResponseDto[];
  missingDocuments: DriverDocumentType[];
  missingDocumentLabels: string[];
  canSubmitForReview: boolean;
  submittedForReviewAt: string | null;
  nextStep: 'COMPLETE_PROFILE' | 'UPLOAD_DOCUMENTS' | 'WAITING_APPROVAL' | 'HOME';
}
