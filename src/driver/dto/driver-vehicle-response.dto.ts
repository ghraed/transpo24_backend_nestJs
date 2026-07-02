import {
  VehicleType,
  VehicleCargoType,
  DayOfWeek,
  DocumentStatus,
  DriverDocumentType,
  DriverStatus,
  DriverVehicleCondition,
  DriverVehicleReviewStatus,
} from '@prisma/client';
import { DriverVehicleApiType } from './driver-vehicle-type.util';

export type CanonicalVehicleType = DriverVehicleApiType;

export type DriverVehicleNextStep =
  | 'COMPLETE_PROFILE'
  | 'ADD_VEHICLE_DOCUMENTS'
  | 'SET_AVAILABILITY'
  | 'WAITING_APPROVAL'
  | 'HOME';

export interface DriverVehicleCompletenessResponseDto {
  hasBasicInfo: boolean;
  hasLoadCapacityProfile: boolean;
  hasRequiredPhotos: boolean;
  hasRequiredDocuments: boolean;
  isComplete: boolean;
  missingFields: string[];
}

export interface VehicleResponseDto {
  id: string;
  driverId: string;
  vehicleType: CanonicalVehicleType;
  vehicleTypeLegacy: VehicleType;
  brand: string;
  make: string;
  model: string;
  year: number;
  licensePlateNumber: string;
  plateNumber: string;
  condition: DriverVehicleCondition;
  color: string | null;
  loadProfileName: string | null;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  dimensionsAreStandard: boolean;
  allowedCargoTypes: VehicleCargoType[];
  workingSchedule: Array<{
    dayOfWeek: DayOfWeek;
    isAvailable: boolean;
    timeRanges: Array<{
      startTime: string;
      endTime: string;
    }>;
  }>;
  isDefaultLoadProfile: boolean;
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
  completeness: DriverVehicleCompletenessResponseDto;
  status: DriverVehicleReviewStatus;
  verificationStatus: DriverVehicleReviewStatus;
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
