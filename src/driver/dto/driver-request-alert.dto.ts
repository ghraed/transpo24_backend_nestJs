import {
  DriverRequestAlertStatus,
  ItemType,
  ServiceKey,
  TransportRequestStatus,
  VehicleCondition,
} from '@prisma/client';

export interface DriverRequestAlertServiceDto {
  id: string;
  key: ServiceKey;
  nameEn: string;
  nameAr: string;
  icon: string | null;
}

export interface DriverRequestAlertSummaryDto {
  alertId: string;
  requestId: string;
  alertStatus: DriverRequestAlertStatus;
  requestStatus: TransportRequestStatus;
  service: DriverRequestAlertServiceDto | null;
  pickup: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
  };
  dropoff: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
  };
  schedule: {
    isImmediate: boolean;
    scheduledPickupAt: string | null;
  };
  item: {
    title: string | null;
    type: ItemType | null;
    description: string | null;
  };
  vehicleDetails: {
    vin: string | null;
    brand: string | null;
    model: string | null;
    series: string | null;
    variant: string | null;
    manufactureYear: number | null;
    estimatedWeightKg: number | null;
    bodyType: string | null;
    condition: VehicleCondition | null;
    conditionNotes: string | null;
  };
  distanceKm: number | null;
  createdAt: string;
  submittedAt: string | null;
}

export interface DriverRequestAlertsResponseDto {
  alerts: DriverRequestAlertSummaryDto[];
}

export interface DriverRequestDetailsResponseDto extends DriverRequestAlertSummaryDto {
  customer: {
    firstName: string | null;
    rating: number | null;
  } | null;
  itemDetails: {
    title: string | null;
    description: string | null;
    type: ItemType | null;
    brand: string | null;
    model: string | null;
    year: number | null;
    condition: string | null;
    weightKg: number | null;
    dimensions: {
      lengthCm: number | null;
      widthCm: number | null;
      heightCm: number | null;
    };
    requiresLoadingHelp: boolean;
    loadingWorkersCount: number | null;
    specialInstructions: string | null;
  };
  photos: Array<{
    id: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
    createdAt: string;
  }>;
}

export interface DriverRequestAlertActionResponseDto {
  alertId: string;
  requestId: string;
  alertStatus: DriverRequestAlertStatus;
  nextStep?: 'SEND_PRICE_OFFER';
}
