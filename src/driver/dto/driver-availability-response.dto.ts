import { DayOfWeek, DriverStatus } from '@prisma/client';

export type DriverAvailabilityNextStep =
  | 'COMPLETE_PROFILE'
  | 'ADD_VEHICLE_DOCUMENTS'
  | 'SET_AVAILABILITY'
  | 'WAITING_APPROVAL'
  | 'HOME';

export interface DriverAvailabilityDayResponseDto {
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface DriverAvailabilityResponseDto {
  id: string | null;
  driverId: string;
  timezone: string;
  isOnline: boolean;
  serviceRadiusKm: number;
  baseLatitude: number | null;
  baseLongitude: number | null;
  baseAddress: string | null;
  acceptsImmediateRequests: boolean;
  acceptsScheduledRequests: boolean;
  weeklySchedule: DriverAvailabilityDayResponseDto[];
  nextStep: DriverAvailabilityNextStep;
  driverStatus: DriverStatus;
  createdAt: string | null;
  updatedAt: string | null;
}
