import { TransportRequestStatus, VehicleCondition } from '@prisma/client';

import { DriverOfferResponseDto } from './driver-offer.dto';

export interface DriverAcceptedJobSummaryDto {
  requestId: string;
  requestStatus: TransportRequestStatus;
  acceptedAt: string | null;
  service: {
    id: string;
    key: string;
    nameEn: string;
    nameAr: string;
    icon: string | null;
  } | null;
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
    type: string | null;
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
  acceptedOffer: DriverOfferResponseDto;
  nextStep: 'GO_TO_PICKUP';
}

export interface DriverAcceptedJobDetailsResponseDto extends DriverAcceptedJobSummaryDto {
  customer: {
    firstName: string | null;
    phone: string | null;
    rating: number | null;
  } | null;
  itemDetails: {
    title: string | null;
    description: string | null;
    type: string | null;
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
  photos: {
    id: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
    createdAt: string;
  }[];
}
