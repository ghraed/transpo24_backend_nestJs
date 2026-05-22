import { TransportRequestStatus, VehicleCondition } from '@prisma/client';

export class CustomerRequestResponseDto {
  id!: string;
  serviceId!: string;
  status!: TransportRequestStatus;
  submittedAt!: string | null;
  pickupLocation!: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    placeId: string | null;
  };
  dropoffLocation!: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    placeId: string | null;
  };
  schedule!: {
    isImmediate: boolean;
    scheduledPickupAt: string | null;
  };
  itemDetails!: {
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
  vehicleDetails?: {
    vin: string | null;
    brand: string | null;
    model: string | null;
    series: string | null;
    variant: string | null;
    manufactureYear: number | null;
    estimatedWeightKg: number | null;
    bodyType: string | null;
    dataSource: string | null;
    condition: VehicleCondition | null;
    conditionNotes: string | null;
  };
  photos!: Array<{
    id: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
    createdAt: string;
  }>;
}

export class CustomerRequestStatusResponseDto extends CustomerRequestResponseDto {
  service?: {
    id: string;
    key: string;
    nameEn: string;
    nameAr: string;
    icon: string | null;
  };
  statusLabel!: string;
  createdAt!: string;
  updatedAt!: string;
  quotesSummary!: {
    count: number;
    lowestPrice: number | null;
    currency: string | null;
    hasOffers: boolean;
  };
  driverSummary!: {
    assigned: boolean;
    driverId: string | null;
    driverName: string | null;
    vehicleInfo: string | null;
  };
  trackingSummary!: {
    available: boolean;
    currentLatitude: number | null;
    currentLongitude: number | null;
    lastUpdatedAt: string | null;
  };
}

export class CustomerHomeRequestSummaryDto {
  id!: string;
  serviceName!: string | null;
  serviceKey!: string | null;
  status!: TransportRequestStatus;
  statusLabel!: string;
  pickupAddress!: string | null;
  dropoffAddress!: string | null;
  scheduledPickupAt!: string | null;
  submittedAt!: string | null;
  createdAt?: string;
}

export class CustomerHomeResponseDto {
  customer!: {
    id: string;
    fullName: string | null;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
  };
  activeRequest!: CustomerHomeRequestSummaryDto | null;
  recentRequests!: CustomerHomeRequestSummaryDto[];
  counters!: {
    totalRequests: number;
    activeRequests: number;
    completedRequests: number;
    cancelledRequests: number;
    pendingQuotesRequests: number;
  };
  notifications!: {
    unreadCount: number;
  };
}
