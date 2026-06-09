import { DriverStatus } from '@prisma/client';

export type DriverOnboardingNextStep =
  | 'COMPLETE_PROFILE'
  | 'UPLOAD_DOCUMENTS'
  | 'WAITING_APPROVAL'
  | 'HOME';

export interface DriverOnboardingResponseDto {
  driverId: string;
  fullNameOnId: string | null;
  dateOfBirth: string | null;
  coverageCity: string | null;
  coverageAreas: string[];
  idOrResidencyNumberMasked: string | null;
  onboardingStatus: DriverStatus;
  isPersonalInfoCompleted: boolean;
  nextStep: DriverOnboardingNextStep;
}
