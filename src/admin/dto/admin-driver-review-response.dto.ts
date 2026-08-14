import {
  DocumentStatus,
  DriverDocumentType,
  DriverStatus,
  DriverVehicleReviewStatus,
  IdentityDocumentKind,
  VehicleType,
} from '@prisma/client';

export interface AdminDriverReviewDocumentDto {
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

export interface AdminDriverReviewVehicleDto {
  id: string;
  vehicleType: VehicleType;
  brand: string;
  model: string;
  year: number;
  licensePlateNumber: string;
  status: DriverVehicleReviewStatus;
  rejectionReason: string | null;
  isActive: boolean;
  hasRequiredDocuments: boolean;
  hasLoadCapacityProfile: boolean;
  createdAt: string;
  updatedAt: string;
  documents: AdminDriverReviewDocumentDto[];
}

export interface AdminDriverReviewResponseDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  coverageAreas: string[];
  identityDocumentKind: IdentityDocumentKind | null;
  status: DriverStatus;
  submittedForReviewAt: string | null;
  createdAt: string;
  updatedAt: string;
  onboardingDocuments: AdminDriverReviewDocumentDto[];
  vehicles: AdminDriverReviewVehicleDto[];
  vehicle: AdminDriverReviewVehicleDto | null;
}
