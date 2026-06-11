import {
  DocumentStatus,
  DriverDocumentType,
  DriverStatus,
  DriverVehicleCondition,
  DriverVehicleReviewStatus,
} from '@prisma/client';

export type CanonicalVehicleType =
  | 'FLATBED_OPEN'
  | 'FLATBED_ENCLOSED'
  | 'SMALL_TRUCK'
  | 'MEDIUM_TRUCK'
  | 'PICKUP'
  | 'VAN'
  | 'TOW_TRUCK'
  | 'MOTORCYCLE';

export type DriverVehicleNextStep =
  | 'COMPLETE_PROFILE'
  | 'ADD_VEHICLE_DOCUMENTS'
  | 'SET_AVAILABILITY'
  | 'WAITING_APPROVAL'
  | 'HOME';

export interface VehicleResponseDto {
  id: string;
  driverId: string;
  vehicleType: CanonicalVehicleType;
  brand: string;
  make: string;
  model: string;
  year: number;
  licensePlateNumber: string;
  plateNumber: string;
  condition: DriverVehicleCondition;
  color: string | null;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  hasTrailer: boolean;
  frontPhotoUrl: string | null;
  rearPhotoUrl: string | null;
  sidePhotoUrl: string | null;
  licensePlatePhotoUrl: string | null;
  registrationFrontDocumentUrl: string | null;
  registrationBackDocumentUrl: string | null;
  insuranceDocumentUrl: string | null;
  insuranceExpiryDate: string | null;
  registrationExpiryDate: string | null;
  status: DriverVehicleReviewStatus;
  rejectionReason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverDocumentResponseDto {
  id: string;
  vehicleId: string | null;
  type: DriverDocumentType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionReason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface DriverVehicleDocumentsResponseDto {
  vehicle: VehicleResponseDto;
  documents: DriverDocumentResponseDto[];
  nextStep: DriverVehicleNextStep;
}

export interface DriverVehicleListItemDto {
  vehicle: VehicleResponseDto;
  documents: DriverDocumentResponseDto[];
}

export interface DriverVehiclesListResponseDto {
  driverStatus: DriverStatus;
  nextStep: DriverVehicleNextStep;
  vehicles: DriverVehicleListItemDto[];
}
