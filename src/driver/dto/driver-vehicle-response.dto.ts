import {
  DocumentStatus,
  DriverDocumentType,
  DriverStatus,
  VehicleType,
} from '@prisma/client';

export type DriverVehicleNextStep =
  | 'COMPLETE_PROFILE'
  | 'ADD_VEHICLE_DOCUMENTS'
  | 'SET_AVAILABILITY'
  | 'WAITING_APPROVAL'
  | 'HOME';

export interface VehicleResponseDto {
  id: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  color: string | null;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  hasTrailer: boolean;
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
