import { DriverStatus, PreferredLanguage } from '@prisma/client';

export type DriverNextStep =
  | 'COMPLETE_PROFILE'
  | 'ADD_VEHICLE_DOCUMENTS'
  | 'SET_AVAILABILITY'
  | 'WAITING_APPROVAL'
  | 'HOME';

export interface DriverProfileResponseDto {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string | null;
  countryCodes: string[];
  city: string | null;
  cities: string[];
  coverageAreas: string[];
  fullNameOnId: string | null;
  dateOfBirth: string | null;
  idOrResidencyNumberMasked: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  preferredLanguage: PreferredLanguage | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  profilePhotoUrl: string | null;
  status: DriverStatus;
  isProfileCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverMeResponseDto {
  user: {
    id: string;
    email: string;
    role: 'DRIVER';
  };
  driver: DriverProfileResponseDto;
  nextStep: DriverNextStep;
}
