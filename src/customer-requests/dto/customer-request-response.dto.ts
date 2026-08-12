import {
  GoodsHeavyShipmentType,
  GoodsShipmentSize,
  MotorcycleCondition,
  MotorcycleType,
  TransportRequestStatus,
  VehicleCondition,
} from '@prisma/client';

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
  motorcycleDetails?: {
    type: MotorcycleType | null;
    chassisNumber: string | null;
    condition: MotorcycleCondition | null;
    requiresSpecialWrapping: boolean;
    requiresDedicatedCarrier: boolean;
  };
  goodsDetails?: {
    shipmentSize: GoodsShipmentSize | null;
    goodsDescription: string | null;
    approximateWeightKg: number | null;
    numberOfPieces: number | null;
    isFragile: boolean;
    requiresRefrigeration: boolean;
    heavyShipmentType: GoodsHeavyShipmentType | null;
  };
  furnitureDetails?: {
    description: string | null;
    approximateItemCount: number | null;
    needsHelpers: boolean;
    movingDate: string | null;
    customerCanHelpLoading: boolean;
  };
  photos!: Array<{
    id: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
    createdAt: string;
  }>;
  dispatchSummary?: {
    eligibleDriversCount: number;
    connectedDriversCount: number;
    alertsCreatedCount: number;
    broadcastedAt: string;
    noConnectedDriversAvailable: boolean;
  };
}

export class CustomerRequestStatusResponseDto extends CustomerRequestResponseDto {
  cancellation!: {
    canCancelCollectedTrip: boolean;
    reason: string | null;
    refundPreview: {
      currency: string;
      refundedAmount: number;
      retainedAmount: number;
    } | null;
    action: 'CANCEL_COLLECTED_TRIP' | 'CANCEL_PAYMENT_HOLD' | 'NONE';
  };
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
    email: string | null;
    phone: string | null;
    countryCode: string | null;
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
