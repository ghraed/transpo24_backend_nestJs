import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { relative } from 'node:path';
import type { File as MulterFile } from 'multer';
import {
  DriverDocumentType,
  DriverOfferStatus,
  DriverRequestAlertStatus,
  DriverStatus,
  GoodsHeavyShipmentType,
  GoodsShipmentSize,
  ItemCondition,
  ItemType,
  MotorcycleCondition,
  MotorcycleType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ServiceKey,
  TransportProofPhotoType,
  TransportRequestStatus,
  VehicleCondition,
  VehicleCargoType,
  VehicleType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentSummaryDto } from '../payments/dto/request-payment.dto';
import { TripsGateway } from '../trips/trips.gateway';
import {
  canVehicleSupportRequestLoad,
  isWorkingScheduleAvailableForDate,
  type WorkingDayScheduleValue,
} from '../driver/vehicle-load-capacity.util';
import {
  CustomerRequestResponseDto,
  CustomerHomeRequestSummaryDto,
  CustomerHomeResponseDto,
  CustomerRequestStatusResponseDto,
} from './dto/customer-request-response.dto';
import {
  AcceptedOfferResponseDto,
  CustomerAcceptOfferResponseDto,
} from './dto/customer-accept-offer-response.dto';
import {
  CustomerRequestOfferSummaryDto,
  CustomerRequestOffersResponseDto,
} from './dto/customer-request-offers.dto';
import {
  CustomerRequestTrackingResponseDto,
  RequestProofPhotoDto,
} from './dto/customer-request-tracking.dto';

interface CreateCustomerRequestInput {
  customerId: string;
  serviceId: string;
  vehicleVin?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleSeries?: string;
  vehicleVariant?: string;
  vehicleManufactureYear?: number;
  vehicleEstimatedWeightKg?: number;
  vehicleBodyType?: string;
  vehicleDataSource?: string;
  vehicleCondition?: VehicleCondition;
  vehicleConditionNotes?: string;
}

interface UpdatePickupLocationInput {
  customerId: string;
  requestId: string;
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

interface UpdateDropoffLocationInput {
  customerId: string;
  requestId: string;
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

interface UpdateScheduleAndItemDetailsInput {
  customerId: string;
  requestId: string;
  isImmediate: boolean;
  scheduledPickupAt?: Date;
  itemTitle: string;
  itemDescription?: string;
  itemType: ItemType;
  itemBrand?: string;
  itemModel?: string;
  itemYear?: number;
  vehicleVin?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleSeries?: string;
  vehicleVariant?: string;
  vehicleManufactureYear?: number;
  vehicleEstimatedWeightKg?: number;
  vehicleBodyType?: string;
  vehicleDataSource?: string;
  vehicleCondition?: VehicleCondition;
  vehicleConditionNotes?: string;
  itemCondition?: ItemCondition;
  itemWeightKg?: number;
  itemLengthCm?: number;
  itemWidthCm?: number;
  itemHeightCm?: number;
  requiresLoadingHelp: boolean;
  loadingWorkersCount?: number;
  specialInstructions?: string;
}

interface GetCustomerRequestTrackingInput {
  customerId: string;
  requestId: string;
}

interface MotorcycleRequestLocationInput {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

interface CreateMotorcycleTransportRequestInput {
  customerId: string;
  motorcycleType: MotorcycleType;
  chassisNumber?: string;
  motorcycleCondition: MotorcycleCondition;
  requiresSpecialWrapping: boolean;
  requiresDedicatedCarrier: boolean;
  isImmediate?: boolean;
  scheduledPickupAt?: Date;
  pickupLocation: MotorcycleRequestLocationInput;
  deliveryLocation: MotorcycleRequestLocationInput;
}

interface GoodsRequestLocationInput {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

interface CreateGoodsTransportRequestInput {
  customerId: string;
  shipmentSize: GoodsShipmentSize;
  goodsDescription: string;
  approximateWeightKg: number;
  numberOfPieces: number;
  isFragile: boolean;
  requiresRefrigeration: boolean;
  heavyShipmentType?: GoodsHeavyShipmentType;
  isImmediate?: boolean;
  scheduledPickupAt?: Date;
  pickupLocation: GoodsRequestLocationInput;
  deliveryLocation: GoodsRequestLocationInput;
}

interface FurnitureRequestLocationInput {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

interface CreateFurnitureTransportRequestInput {
  customerId: string;
  furnitureDescription: string;
  approximateItemCount: number;
  needsHelpers?: boolean;
  isImmediate?: boolean;
  scheduledPickupAt?: Date;
  movingDate: Date;
  customerCanHelpLoading?: boolean;
  pickupLocation: FurnitureRequestLocationInput;
  deliveryLocation: FurnitureRequestLocationInput;
  files: MulterFile[];
}

interface UploadRequestPhotosInput {
  customerId: string;
  requestId: string;
  files: MulterFile[];
}

interface DeleteRequestPhotoInput {
  customerId: string;
  requestId: string;
  photoId: string;
}

interface SubmitCustomerRequestInput {
  customerId: string;
  requestId: string;
  customerNote?: string;
}

interface AcceptDriverOfferInput {
  customerId: string;
  requestId: string;
  offerId: string;
  confirm: boolean;
  paymentMethod: PaymentMethod;
  stripePaymentMethodId?: string;
}

interface FinalizeAcceptedOfferPaymentInput {
  customerId: string;
  requestId: string;
}

const RETRYABLE_PAYMENT_HOLD_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PAYMENT_FAILED,
  PaymentStatus.PAYMENT_RELEASED,
  PaymentStatus.PAYMENT_CANCELLED,
]);

const SUCCESSFUL_PAYMENT_HOLD_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PAYMENT_HELD,
  PaymentStatus.PAYMENT_CAPTURE_PENDING,
  PaymentStatus.PAYMENT_CAPTURED,
]);

const ACTIVE_PAYMENT_HOLD_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PAYMENT_HOLD_PENDING,
  PaymentStatus.PAYMENT_HELD,
  PaymentStatus.PAYMENT_CAPTURE_PENDING,
  PaymentStatus.PAYMENT_CAPTURED,
]);

interface GetCustomerRequestStatusInput {
  customerId: string;
  requestId: string;
}

interface GetCustomerRequestOffersInput {
  customerId: string;
  requestId: string;
}

interface GetCustomerHomeInput {
  customerId: string;
}

interface ListCustomerRequestsInput {
  customerId: string;
}

interface DeleteCustomerRequestInput {
  customerId: string;
  requestId: string;
}

type RequestLocationResponse = {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  placeId: string | null;
};

type ScheduleResponse = {
  isImmediate: boolean;
  scheduledPickupAt: string | null;
};

type ItemDetailsResponse = {
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

type RequestPhotoResponse = {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
};

type TransportRequestResponseSource = {
  id: string;
  serviceId: string;
  status: TransportRequestStatus;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  pickupAddress: string | null;
  pickupPlaceId: string | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
  dropoffAddress: string | null;
  dropoffPlaceId: string | null;
  scheduledPickupAt: Date | null;
  isImmediate: boolean;
  itemTitle: string | null;
  itemDescription: string | null;
  itemType: ItemType | null;
  itemBrand: string | null;
  itemModel: string | null;
  itemYear: number | null;
  vehicleVin: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleSeries: string | null;
  vehicleVariant: string | null;
  vehicleManufactureYear: number | null;
  vehicleEstimatedWeightKg: number | null;
  vehicleBodyType: string | null;
  vehicleDataSource: string | null;
  vehicleCondition: VehicleCondition | null;
  vehicleConditionNotes: string | null;
  motorcycleType: MotorcycleType | null;
  motorcycleChassisNumber: string | null;
  motorcycleCondition: MotorcycleCondition | null;
  requiresSpecialWrapping: boolean;
  requiresDedicatedCarrier: boolean;
  goodsShipmentSize: GoodsShipmentSize | null;
  goodsDescription: string | null;
  goodsApproximateWeightKg: number | null;
  goodsNumberOfPieces: number | null;
  goodsIsFragile: boolean;
  goodsRequiresRefrigeration: boolean;
  goodsHeavyShipmentType: GoodsHeavyShipmentType | null;
  furnitureDescription: string | null;
  furnitureApproximateItemCount: number | null;
  furnitureNeedsHelpers: boolean;
  furnitureCustomerCanHelpLoading: boolean;
  itemCondition: ItemCondition | null;
  itemWeightKg: number | null;
  itemLengthCm: number | null;
  itemWidthCm: number | null;
  itemHeightCm: number | null;
  requiresLoadingHelp: boolean;
  loadingWorkersCount: number | null;
  specialInstructions: string | null;
  customerNote: string | null;
  submittedAt: Date | null;
  photos: Array<{
    id: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
    createdAt: Date;
  }>;
};

type TransportRequestStatusResponseSource = TransportRequestResponseSource & {
  assignedDriverId: string | null;
  createdAt: Date;
  updatedAt: Date;
  service: {
    id: string;
    key: ServiceKey;
    nameEn: string;
    nameAr: string;
    icon: string;
  };
  assignedDriver: {
    firstName: string;
    lastName: string;
    vehicles: Array<{
      make: string;
      model: string;
      plateNumber: string;
      color: string | null;
    }>;
  } | null;
  driverLocations: Array<{
    latitude: number;
    longitude: number;
    recordedAt: Date;
  }>;
};

type CustomerHomeRequestSource = {
  id: string;
  status: TransportRequestStatus;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  scheduledPickupAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  service: {
    key: ServiceKey;
    nameEn: string;
  };
};

type AcceptedOfferSource = {
  id: string;
  requestId: string;
  driverId: string;
  price: Prisma.Decimal;
  currency: string;
  estimatedPickupAt: Date | null;
  estimatedDeliveryAt: Date | null;
  estimatedDurationMinutes: number | null;
  message: string | null;
  status: DriverOfferStatus;
  acceptedAt: Date | null;
  createdAt: Date;
};

type CustomerRequestOfferSource = {
  id: string;
  requestId: string;
  driverId: string;
  price: Prisma.Decimal;
  currency: string;
  estimatedPickupAt: Date | null;
  estimatedDeliveryAt: Date | null;
  estimatedDurationMinutes: number | null;
  message: string | null;
  status: DriverOfferStatus;
  createdAt: Date;
  acceptedAt: Date | null;
  driver: {
    firstName: string;
    lastName: string;
    averageRating: Prisma.Decimal | null;
    profilePhotoUrl: string | null;
    vehicles: Array<{
      documents: Array<{
        url: string;
      }>;
    }>;
  };
};

type DispatchSummary = CustomerRequestResponseDto['dispatchSummary'];

type EligibleDriverDispatchCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  status: DriverStatus;
  isProfileCompleted: boolean;
  availability: {
    isOnline: boolean;
    baseLatitude: number | null;
    baseLongitude: number | null;
    serviceRadiusKm: number;
    acceptsImmediateRequests: boolean;
    acceptsScheduledRequests: boolean;
  } | null;
  vehicles: Array<{
    vehicleType: VehicleType;
    capacityKg: number | null;
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
    dimensionsAreStandard: boolean;
    allowedCargoTypes: VehicleCargoType[];
    workingSchedule: Prisma.JsonValue | null;
  }>;
};

type DriverRequestAlertSummaryPayload = {
  alertId: string;
  requestId: string;
  alertStatus: DriverRequestAlertStatus;
  requestStatus: TransportRequestStatus;
  service: {
    id: string;
    key: ServiceKey;
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
};

const MAX_TOTAL_PHOTOS = 8;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const REQUEST_SELECT = {
  id: true,
  serviceId: true,
  status: true,
  submittedAt: true,
  pickupLatitude: true,
  pickupLongitude: true,
  pickupAddress: true,
  pickupPlaceId: true,
  dropoffLatitude: true,
  dropoffLongitude: true,
  dropoffAddress: true,
  dropoffPlaceId: true,
  scheduledPickupAt: true,
  isImmediate: true,
  itemTitle: true,
  itemDescription: true,
  itemType: true,
  itemBrand: true,
  itemModel: true,
  itemYear: true,
  vehicleVin: true,
  vehicleBrand: true,
  vehicleModel: true,
  vehicleSeries: true,
  vehicleVariant: true,
  vehicleManufactureYear: true,
  vehicleEstimatedWeightKg: true,
  vehicleBodyType: true,
  vehicleDataSource: true,
  vehicleCondition: true,
  vehicleConditionNotes: true,
  motorcycleType: true,
  motorcycleChassisNumber: true,
  motorcycleCondition: true,
  requiresSpecialWrapping: true,
  requiresDedicatedCarrier: true,
  goodsShipmentSize: true,
  goodsDescription: true,
  goodsApproximateWeightKg: true,
  goodsNumberOfPieces: true,
  goodsIsFragile: true,
  goodsRequiresRefrigeration: true,
  goodsHeavyShipmentType: true,
  furnitureDescription: true,
  furnitureApproximateItemCount: true,
  furnitureNeedsHelpers: true,
  furnitureCustomerCanHelpLoading: true,
  itemCondition: true,
  itemWeightKg: true,
  itemLengthCm: true,
  itemWidthCm: true,
  itemHeightCm: true,
  requiresLoadingHelp: true,
  loadingWorkersCount: true,
  specialInstructions: true,
  customerNote: true,
  photos: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      sortOrder: true,
      createdAt: true,
    },
  },
} satisfies Prisma.TransportRequestSelect;

const REQUEST_STATUS_SELECT = {
  ...REQUEST_SELECT,
  customerId: true,
  assignedDriverId: true,
  createdAt: true,
  updatedAt: true,
  service: {
    select: {
      id: true,
      key: true,
      nameEn: true,
      nameAr: true,
      icon: true,
    },
  },
  assignedDriver: {
    select: {
      firstName: true,
      lastName: true,
      vehicles: {
        where: { isActive: true },
        select: {
          make: true,
          model: true,
          plateNumber: true,
          color: true,
        },
        orderBy: { createdAt: 'asc' as const },
        take: 1,
      },
    },
  },
  driverLocations: {
    where: {
      requestId: { not: null },
    },
    orderBy: { recordedAt: 'desc' as const },
    select: {
      latitude: true,
      longitude: true,
      recordedAt: true,
    },
    take: 1,
  },
} satisfies Prisma.TransportRequestSelect;

const DRIVER_SERVICE_VEHICLE_TYPE_MAP: Record<ServiceKey, VehicleType[]> = {
  VEHICLE_TRANSPORT: [
    'CAR_CARRIER',
    'FLATBED_TRUCK',
    'TOW_TRUCK',
    'FLATBED_OPEN',
    'FLATBED_ENCLOSED',
  ],
  MOTORCYCLE_TRANSPORT: [
    'MOTORCYCLE_TRAILER',
    'VAN',
    'PICKUP_TRUCK',
    'MOTORCYCLE',
    'PICKUP',
    'FLATBED_TRUCK',
    'FLATBED_OPEN',
    'FLATBED_ENCLOSED',
    'TOW_TRUCK',
    'CAR_CARRIER',
  ],
  GOODS_TRANSPORT: [
    'VAN',
    'BOX_TRUCK',
    'PICKUP_TRUCK',
    'SMALL_TRUCK',
    'MEDIUM_TRUCK',
    'PICKUP',
  ],
  FURNITURE_TRANSPORT: [
    'FURNITURE_TRUCK',
    'BOX_TRUCK',
    'VAN',
    'SMALL_TRUCK',
    'MEDIUM_TRUCK',
  ],
};

const STATUS_LABELS: Record<TransportRequestStatus, string> = {
  DRAFT: 'Draft',
  PENDING_QUOTES: 'Waiting for driver offers',
  QUOTED: 'Offers received',
  ACCEPTED: 'Offer accepted',
  DRIVER_ASSIGNED: 'Driver assigned',
  DRIVER_GOING_TO_PICKUP: 'Driver going to pickup',
  DRIVER_ARRIVED_PICKUP: 'Driver arrived at pickup',
  ITEM_PICKED_UP: 'Item picked up',
  PICKUP_IN_PROGRESS: 'Driver heading to pickup',
  IN_TRANSIT: 'In transit',
  DRIVER_GOING_TO_DROPOFF: 'Driver going to dropoff',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const ACTIVE_REQUEST_STATUSES: TransportRequestStatus[] = [
  TransportRequestStatus.PENDING_QUOTES,
  TransportRequestStatus.QUOTED,
  TransportRequestStatus.ACCEPTED,
  TransportRequestStatus.DRIVER_ASSIGNED,
  TransportRequestStatus.DRIVER_GOING_TO_PICKUP,
  TransportRequestStatus.DRIVER_ARRIVED_PICKUP,
  TransportRequestStatus.ITEM_PICKED_UP,
  TransportRequestStatus.PICKUP_IN_PROGRESS,
  TransportRequestStatus.IN_TRANSIT,
  TransportRequestStatus.DRIVER_GOING_TO_DROPOFF,
];

const HOLD_DELETABLE_REQUEST_STATUSES: TransportRequestStatus[] = [
  TransportRequestStatus.DRAFT,
  TransportRequestStatus.PENDING_QUOTES,
  TransportRequestStatus.QUOTED,
  TransportRequestStatus.CANCELLED,
];

const DELETABLE_REQUEST_STATUSES: TransportRequestStatus[] = [
  TransportRequestStatus.DRAFT,
  TransportRequestStatus.PENDING_QUOTES,
  TransportRequestStatus.QUOTED,
  TransportRequestStatus.CANCELLED,
];

const ACCEPTABLE_OFFER_REQUEST_STATUSES: TransportRequestStatus[] = [
  TransportRequestStatus.PENDING_QUOTES,
  TransportRequestStatus.QUOTED,
];

@Injectable()
export class CustomerRequestsService {
  private readonly logger = new Logger(CustomerRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    @Inject(forwardRef(() => TripsGateway))
    private readonly tripsGateway: TripsGateway,
  ) {}

  async createDraftRequest(
    input: CreateCustomerRequestInput,
  ): Promise<CustomerRequestResponseDto> {
    const service = await this.prisma.service.findUnique({
      where: { id: input.serviceId },
      select: { id: true, isActive: true, key: true },
    });

    if (!service || !service.isActive) {
      throw new BadRequestException('Service does not exist or is inactive.');
    }

    this.assertVehicleConditionForService({
      serviceKey: service.key,
      vehicleCondition: input.vehicleCondition,
    });

    const request = await this.prisma.transportRequest.create({
      data: {
        customerId: input.customerId,
        serviceId: input.serviceId,
        status: TransportRequestStatus.DRAFT,
        vehicleVin: input.vehicleVin?.trim().toUpperCase() || null,
        vehicleBrand: input.vehicleBrand?.trim() || null,
        vehicleModel: input.vehicleModel?.trim() || null,
        vehicleSeries: input.vehicleSeries?.trim() || null,
        vehicleVariant: input.vehicleVariant?.trim() || null,
        vehicleManufactureYear: input.vehicleManufactureYear ?? null,
        vehicleEstimatedWeightKg: input.vehicleEstimatedWeightKg ?? null,
        vehicleBodyType: input.vehicleBodyType?.trim() || null,
        vehicleDataSource: input.vehicleDataSource?.trim() || null,
        vehicleCondition:
          service.key === ServiceKey.VEHICLE_TRANSPORT
            ? (input.vehicleCondition ?? null)
            : null,
        vehicleConditionNotes:
          service.key === ServiceKey.VEHICLE_TRANSPORT
            ? input.vehicleConditionNotes?.trim() || null
            : null,
      },
      select: REQUEST_SELECT,
    });

    return this.toResponseDto(request);
  }

  async createMotorcycleTransportRequest(
    input: CreateMotorcycleTransportRequestInput,
  ): Promise<CustomerRequestResponseDto> {
    const service = await this.prisma.service.findUnique({
      where: { key: ServiceKey.MOTORCYCLE_TRANSPORT },
      select: { id: true, isActive: true },
    });

    if (!service || !service.isActive) {
      throw new BadRequestException(
        'Motorcycle transport service does not exist or is inactive.',
      );
    }

    const isSameAsPickup =
      input.pickupLocation.latitude === input.deliveryLocation.latitude &&
      input.pickupLocation.longitude === input.deliveryLocation.longitude;

    if (isSameAsPickup) {
      throw new BadRequestException(
        'Pickup and delivery locations cannot be exactly the same.',
      );
    }

    if (input.scheduledPickupAt && Number.isNaN(input.scheduledPickupAt.getTime())) {
      throw new BadRequestException(
        'scheduledPickupAt must be a valid ISO date.',
      );
    }

    if (input.isImmediate === false && !input.scheduledPickupAt) {
      throw new BadRequestException(
        'scheduledPickupAt is required when isImmediate is false.',
      );
    }

    if (
      input.scheduledPickupAt &&
      input.scheduledPickupAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('scheduledPickupAt cannot be in the past.');
    }

    const request = await this.prisma.transportRequest.create({
      data: {
        customerId: input.customerId,
        serviceId: service.id,
        status: TransportRequestStatus.DRAFT,
        submittedAt: null,
        isImmediate: input.isImmediate ?? true,
        scheduledPickupAt:
          input.isImmediate === false
            ? (input.scheduledPickupAt ?? null)
            : null,
        pickupLatitude: input.pickupLocation.latitude,
        pickupLongitude: input.pickupLocation.longitude,
        pickupAddress: input.pickupLocation.address?.trim() || null,
        pickupPlaceId: input.pickupLocation.placeId?.trim() || null,
        dropoffLatitude: input.deliveryLocation.latitude,
        dropoffLongitude: input.deliveryLocation.longitude,
        dropoffAddress: input.deliveryLocation.address?.trim() || null,
        dropoffPlaceId: input.deliveryLocation.placeId?.trim() || null,
        itemTitle: this.toMotorcycleRequestTitle(input.motorcycleType),
        itemType: ItemType.MOTORCYCLE,
        motorcycleType: input.motorcycleType,
        motorcycleChassisNumber:
          input.chassisNumber?.trim().toUpperCase() || null,
        motorcycleCondition: input.motorcycleCondition,
        requiresSpecialWrapping: input.requiresSpecialWrapping,
        requiresDedicatedCarrier: input.requiresDedicatedCarrier,
      },
      select: REQUEST_SELECT,
    });

    return this.toResponseDto(request);
  }

  async createGoodsTransportRequest(
    input: CreateGoodsTransportRequestInput,
  ): Promise<CustomerRequestResponseDto> {
    const service = await this.prisma.service.findUnique({
      where: { key: ServiceKey.GOODS_TRANSPORT },
      select: { id: true, isActive: true },
    });

    if (!service || !service.isActive) {
      throw new BadRequestException(
        'Goods transport service does not exist or is inactive.',
      );
    }

    const isSameAsPickup =
      input.pickupLocation.latitude === input.deliveryLocation.latitude &&
      input.pickupLocation.longitude === input.deliveryLocation.longitude;

    if (isSameAsPickup) {
      throw new BadRequestException(
        'Pickup and delivery locations cannot be exactly the same.',
      );
    }

    if (input.approximateWeightKg <= 0) {
      throw new BadRequestException(
        'approximateWeightKg must be greater than 0.',
      );
    }

    if (!Number.isInteger(input.numberOfPieces) || input.numberOfPieces < 1) {
      throw new BadRequestException(
        'numberOfPieces must be an integer greater than or equal to 1.',
      );
    }

    if (input.approximateWeightKg >= 50 && !input.heavyShipmentType) {
      throw new BadRequestException(
        'heavyShipmentType is required when approximateWeightKg is 50 or more.',
      );
    }

    if (input.scheduledPickupAt && Number.isNaN(input.scheduledPickupAt.getTime())) {
      throw new BadRequestException(
        'scheduledPickupAt must be a valid ISO date.',
      );
    }

    if (input.isImmediate === false && !input.scheduledPickupAt) {
      throw new BadRequestException(
        'scheduledPickupAt is required when isImmediate is false.',
      );
    }

    if (
      input.scheduledPickupAt &&
      input.scheduledPickupAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('scheduledPickupAt cannot be in the past.');
    }

    const request = await this.prisma.transportRequest.create({
      data: {
        customerId: input.customerId,
        serviceId: service.id,
        status: TransportRequestStatus.DRAFT,
        isImmediate: input.isImmediate ?? true,
        scheduledPickupAt:
          input.isImmediate === false
            ? (input.scheduledPickupAt ?? null)
            : null,
        pickupLatitude: input.pickupLocation.latitude,
        pickupLongitude: input.pickupLocation.longitude,
        pickupAddress: input.pickupLocation.address?.trim() || null,
        pickupPlaceId: input.pickupLocation.placeId?.trim() || null,
        dropoffLatitude: input.deliveryLocation.latitude,
        dropoffLongitude: input.deliveryLocation.longitude,
        dropoffAddress: input.deliveryLocation.address?.trim() || null,
        dropoffPlaceId: input.deliveryLocation.placeId?.trim() || null,
        itemTitle: `${input.shipmentSize} goods shipment`,
        itemDescription: input.goodsDescription.trim(),
        itemType: ItemType.GOODS,
        itemWeightKg: input.approximateWeightKg,
        itemCondition: input.isFragile ? ItemCondition.FRAGILE : null,
        goodsShipmentSize: input.shipmentSize,
        goodsDescription: input.goodsDescription.trim(),
        goodsApproximateWeightKg: input.approximateWeightKg,
        goodsNumberOfPieces: input.numberOfPieces,
        goodsIsFragile: input.isFragile,
        goodsRequiresRefrigeration: input.requiresRefrigeration,
        goodsHeavyShipmentType:
          input.approximateWeightKg >= 50
            ? (input.heavyShipmentType ?? null)
            : null,
      },
      select: REQUEST_SELECT,
    });

    return this.toResponseDto(request);
  }

  async createFurnitureTransportRequest(
    input: CreateFurnitureTransportRequestInput,
  ): Promise<CustomerRequestResponseDto> {
    if (!input.files || input.files.length === 0) {
      throw new BadRequestException('At least one furniture photo is required.');
    }

    const service = await this.prisma.service.findUnique({
      where: { key: ServiceKey.FURNITURE_TRANSPORT },
      select: { id: true, isActive: true },
    });

    if (!service || !service.isActive) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        'Furniture transport service does not exist or is inactive.',
      );
    }

    const isSameAsPickup =
      input.pickupLocation.latitude === input.deliveryLocation.latitude &&
      input.pickupLocation.longitude === input.deliveryLocation.longitude;

    if (isSameAsPickup) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        'Pickup and delivery locations cannot be exactly the same.',
      );
    }

    if (!input.furnitureDescription?.trim()) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException('furnitureDescription is required.');
    }

    if (
      !Number.isInteger(input.approximateItemCount) ||
      input.approximateItemCount < 1
    ) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        'approximateItemCount must be an integer greater than or equal to 1.',
      );
    }

    if (Number.isNaN(input.movingDate.getTime())) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException('movingDate must be a valid ISO date.');
    }

    if (input.scheduledPickupAt && Number.isNaN(input.scheduledPickupAt.getTime())) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        'scheduledPickupAt must be a valid ISO date.',
      );
    }

    if (input.isImmediate === false && !input.scheduledPickupAt) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        'scheduledPickupAt is required when isImmediate is false.',
      );
    }

    const effectiveMovingDate =
      input.isImmediate === false
        ? (input.scheduledPickupAt ?? input.movingDate)
        : input.movingDate;

    if (effectiveMovingDate.getTime() < Date.now()) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        input.isImmediate === false
          ? 'scheduledPickupAt cannot be in the past.'
          : 'movingDate cannot be in the past.',
      );
    }

    for (const file of input.files) {
      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        await this.cleanupFiles(input.files);
        throw new BadRequestException(
          'Only JPEG, PNG, and WEBP images are allowed.',
        );
      }
    }

    if (input.files.length > MAX_TOTAL_PHOTOS) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        `A request can have up to ${MAX_TOTAL_PHOTOS} photos.`,
      );
    }

    const photoRows = input.files.map((file, index) => {
      const storageKey = relative(process.cwd(), file.path).replace(/\\/g, '/');
      const url = `/${storageKey}`;
      return {
        url,
        storageKey,
        originalName: file.originalname || null,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sortOrder: index + 1,
      };
    });

    try {
      const request = await this.prisma.transportRequest.create({
        data: {
          customerId: input.customerId,
          serviceId: service.id,
          status: TransportRequestStatus.DRAFT,
          submittedAt: null,
          isImmediate: input.isImmediate ?? false,
          scheduledPickupAt: effectiveMovingDate,
          pickupLatitude: input.pickupLocation.latitude,
          pickupLongitude: input.pickupLocation.longitude,
          pickupAddress: input.pickupLocation.address?.trim() || null,
          pickupPlaceId: input.pickupLocation.placeId?.trim() || null,
          dropoffLatitude: input.deliveryLocation.latitude,
          dropoffLongitude: input.deliveryLocation.longitude,
          dropoffAddress: input.deliveryLocation.address?.trim() || null,
          dropoffPlaceId: input.deliveryLocation.placeId?.trim() || null,
          itemTitle: 'Furniture transport',
          itemDescription: input.furnitureDescription.trim(),
          itemType: ItemType.FURNITURE,
          furnitureDescription: input.furnitureDescription.trim(),
          furnitureApproximateItemCount: input.approximateItemCount,
          furnitureNeedsHelpers: input.needsHelpers ?? false,
          furnitureCustomerCanHelpLoading:
            input.customerCanHelpLoading ?? false,
          requiresLoadingHelp: input.needsHelpers ?? false,
          photos: {
            create: photoRows,
          },
        },
        select: REQUEST_SELECT,
      });

      return this.toResponseDto(request);
    } catch (error) {
      await this.cleanupFiles(input.files);
      throw error;
    }
  }

  async updatePickupLocation(
    input: UpdatePickupLocationInput,
  ): Promise<CustomerRequestResponseDto> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    const existingRequest = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
      },
    });

    if (!existingRequest) {
      throw new NotFoundException('Transport request not found.');
    }

    if (existingRequest.customerId !== input.customerId) {
      throw new ForbiddenException(
        'You are not allowed to update this request.',
      );
    }

    if (existingRequest.status !== TransportRequestStatus.DRAFT) {
      throw new BadRequestException(
        'Pickup location can only be updated for draft requests.',
      );
    }

    const updatedRequest = await this.prisma.transportRequest.update({
      where: { id: input.requestId },
      data: {
        pickupLatitude: input.latitude,
        pickupLongitude: input.longitude,
        pickupAddress: input.address ?? null,
        pickupPlaceId: input.placeId ?? null,
      },
      select: REQUEST_SELECT,
    });

    return this.toResponseDto(updatedRequest);
  }

  async updateDropoffLocation(
    input: UpdateDropoffLocationInput,
  ): Promise<CustomerRequestResponseDto> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    const existingRequest = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
        pickupLatitude: true,
        pickupLongitude: true,
      },
    });

    if (!existingRequest) {
      throw new NotFoundException('Transport request not found.');
    }

    if (existingRequest.customerId !== input.customerId) {
      throw new ForbiddenException(
        'You are not allowed to update this request.',
      );
    }

    if (existingRequest.status !== TransportRequestStatus.DRAFT) {
      throw new BadRequestException(
        'Dropoff location can only be updated for draft requests.',
      );
    }

    if (
      existingRequest.pickupLatitude === null ||
      existingRequest.pickupLongitude === null
    ) {
      throw new BadRequestException(
        'Pickup location must be selected before dropoff location.',
      );
    }

    const isSameAsPickup =
      existingRequest.pickupLatitude === input.latitude &&
      existingRequest.pickupLongitude === input.longitude;

    if (isSameAsPickup) {
      throw new BadRequestException(
        'Pickup and dropoff locations cannot be exactly the same.',
      );
    }

    const updatedRequest = await this.prisma.transportRequest.update({
      where: { id: input.requestId },
      data: {
        dropoffLatitude: input.latitude,
        dropoffLongitude: input.longitude,
        dropoffAddress: input.address ?? null,
        dropoffPlaceId: input.placeId ?? null,
      },
      select: REQUEST_SELECT,
    });

    return this.toResponseDto(updatedRequest);
  }

  async updateScheduleAndItemDetails(
    input: UpdateScheduleAndItemDetailsInput,
  ): Promise<CustomerRequestResponseDto> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    const existingRequest = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        service: {
          select: {
            key: true,
          },
        },
      },
    });

    if (!existingRequest) {
      throw new NotFoundException('Transport request not found.');
    }

    if (existingRequest.customerId !== input.customerId) {
      throw new ForbiddenException(
        'You are not allowed to update this request.',
      );
    }

    if (existingRequest.status !== TransportRequestStatus.DRAFT) {
      throw new BadRequestException(
        'Schedule and item details can only be updated for draft requests.',
      );
    }

    if (
      existingRequest.pickupLatitude === null ||
      existingRequest.pickupLongitude === null
    ) {
      throw new BadRequestException(
        'Pickup location must be selected before schedule and item details.',
      );
    }

    if (
      existingRequest.dropoffLatitude === null ||
      existingRequest.dropoffLongitude === null
    ) {
      throw new BadRequestException(
        'Dropoff location must be selected before schedule and item details.',
      );
    }

    if (!input.isImmediate && !input.scheduledPickupAt) {
      throw new BadRequestException(
        'scheduledPickupAt is required when isImmediate is false.',
      );
    }

    if (
      input.scheduledPickupAt &&
      Number.isNaN(input.scheduledPickupAt.getTime())
    ) {
      throw new BadRequestException(
        'scheduledPickupAt must be a valid ISO date.',
      );
    }

    if (
      input.scheduledPickupAt &&
      input.scheduledPickupAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('scheduledPickupAt cannot be in the past.');
    }

    if (!input.itemTitle.trim()) {
      throw new BadRequestException('itemTitle is required.');
    }

    const currentYear = new Date().getFullYear();
    if (
      input.itemYear !== undefined &&
      (input.itemYear < 1900 || input.itemYear > currentYear + 1)
    ) {
      throw new BadRequestException(
        `itemYear must be between 1900 and ${currentYear + 1}.`,
      );
    }

    if (
      input.vehicleManufactureYear !== undefined &&
      (input.vehicleManufactureYear < 1900 ||
        input.vehicleManufactureYear > currentYear + 1)
    ) {
      throw new BadRequestException(
        `vehicleManufactureYear must be between 1900 and ${currentYear + 1}.`,
      );
    }

    if (
      input.vehicleEstimatedWeightKg !== undefined &&
      input.vehicleEstimatedWeightKg <= 0
    ) {
      throw new BadRequestException(
        'vehicleEstimatedWeightKg must be greater than 0.',
      );
    }

    if (
      input.requiresLoadingHelp &&
      (!input.loadingWorkersCount || input.loadingWorkersCount <= 0)
    ) {
      throw new BadRequestException(
        'loadingWorkersCount must be greater than 0 when requiresLoadingHelp is true.',
      );
    }

    const normalizedLoadingWorkersCount = input.requiresLoadingHelp
      ? (input.loadingWorkersCount ?? null)
      : null;

    this.assertVehicleConditionForService({
      serviceKey: existingRequest.service.key,
      vehicleCondition: input.vehicleCondition,
    });

    const updatedRequest = await this.prisma.transportRequest.update({
      where: { id: input.requestId },
      data: {
        isImmediate: input.isImmediate,
        scheduledPickupAt: input.isImmediate
          ? null
          : (input.scheduledPickupAt ?? null),
        itemTitle: input.itemTitle.trim(),
        itemDescription: input.itemDescription?.trim() || null,
        itemType: input.itemType,
        itemBrand: input.itemBrand?.trim() || null,
        itemModel: input.itemModel?.trim() || null,
        itemYear: input.itemYear ?? null,
        vehicleVin: input.vehicleVin?.trim().toUpperCase() || null,
        vehicleBrand: input.vehicleBrand?.trim() || null,
        vehicleModel: input.vehicleModel?.trim() || null,
        vehicleSeries: input.vehicleSeries?.trim() || null,
        vehicleVariant: input.vehicleVariant?.trim() || null,
        vehicleManufactureYear: input.vehicleManufactureYear ?? null,
        vehicleEstimatedWeightKg: input.vehicleEstimatedWeightKg ?? null,
        vehicleBodyType: input.vehicleBodyType?.trim() || null,
        vehicleDataSource: input.vehicleDataSource?.trim() || null,
        vehicleCondition:
          existingRequest.service.key === ServiceKey.VEHICLE_TRANSPORT
            ? (input.vehicleCondition ?? null)
            : null,
        vehicleConditionNotes:
          existingRequest.service.key === ServiceKey.VEHICLE_TRANSPORT
            ? input.vehicleConditionNotes?.trim() || null
            : null,
        itemCondition: input.itemCondition ?? null,
        itemWeightKg: input.itemWeightKg ?? null,
        itemLengthCm: input.itemLengthCm ?? null,
        itemWidthCm: input.itemWidthCm ?? null,
        itemHeightCm: input.itemHeightCm ?? null,
        requiresLoadingHelp: input.requiresLoadingHelp,
        loadingWorkersCount: normalizedLoadingWorkersCount,
        specialInstructions: input.specialInstructions?.trim() || null,
      },
      select: REQUEST_SELECT,
    });

    return this.toResponseDto(updatedRequest);
  }

  async uploadRequestPhotos(
    input: UploadRequestPhotosInput,
  ): Promise<{ requestId: string; photos: RequestPhotoResponse[] }> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    if (!input.files || input.files.length === 0) {
      throw new BadRequestException('At least one image file is required.');
    }

    const existingRequest = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        _count: {
          select: { photos: true },
        },
      },
    });

    if (!existingRequest) {
      await this.cleanupFiles(input.files);
      throw new NotFoundException('Transport request not found.');
    }

    if (existingRequest.customerId !== input.customerId) {
      await this.cleanupFiles(input.files);
      throw new ForbiddenException(
        'You are not allowed to update this request.',
      );
    }

    if (existingRequest.status !== TransportRequestStatus.DRAFT) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        'Photos can only be updated for draft requests.',
      );
    }

    if (
      existingRequest.pickupLatitude === null ||
      existingRequest.pickupLongitude === null
    ) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        'Pickup location must be selected before uploading photos.',
      );
    }

    if (
      existingRequest.dropoffLatitude === null ||
      existingRequest.dropoffLongitude === null
    ) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        'Dropoff location must be selected before uploading photos.',
      );
    }

    for (const file of input.files) {
      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        await this.cleanupFiles(input.files);
        throw new BadRequestException(
          'Only JPEG, PNG, and WEBP images are allowed.',
        );
      }
    }

    const nextTotal = existingRequest._count.photos + input.files.length;
    if (nextTotal > MAX_TOTAL_PHOTOS) {
      await this.cleanupFiles(input.files);
      throw new BadRequestException(
        `A request can have up to ${MAX_TOTAL_PHOTOS} photos.`,
      );
    }

    const startOrder = existingRequest._count.photos;
    const photoRows = input.files.map((file, index) => {
      const storageKey = relative(process.cwd(), file.path).replace(/\\/g, '/');
      const url = `/${storageKey}`;
      return {
        requestId: input.requestId,
        url,
        storageKey,
        originalName: file.originalname || null,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sortOrder: startOrder + index + 1,
      };
    });

    try {
      await this.prisma.transportRequestPhoto.createMany({
        data: photoRows,
      });
    } catch (error) {
      await this.cleanupFiles(input.files);
      throw error;
    }

    const photos = await this.prisma.transportRequestPhoto.findMany({
      where: { requestId: input.requestId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    return {
      requestId: input.requestId,
      photos: this.toPhotoResponses(photos),
    };
  }

  async deleteRequestPhoto(
    input: DeleteRequestPhotoInput,
  ): Promise<{ requestId: string; photos: RequestPhotoResponse[] }> {
    if (!input.requestId.trim() || !input.photoId.trim()) {
      throw new BadRequestException('requestId and photoId are required.');
    }

    const existingRequest = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
      },
    });

    if (!existingRequest) {
      throw new NotFoundException('Transport request not found.');
    }

    if (existingRequest.customerId !== input.customerId) {
      throw new ForbiddenException(
        'You are not allowed to update this request.',
      );
    }

    if (existingRequest.status !== TransportRequestStatus.DRAFT) {
      throw new BadRequestException(
        'Photos can only be updated for draft requests.',
      );
    }

    const photo = await this.prisma.transportRequestPhoto.findFirst({
      where: {
        id: input.photoId,
        requestId: input.requestId,
      },
      select: {
        id: true,
        storageKey: true,
      },
    });

    if (!photo) {
      throw new NotFoundException('Photo not found.');
    }

    await this.prisma.transportRequestPhoto.delete({
      where: { id: photo.id },
    });

    if (photo.storageKey) {
      const absolutePath = `${process.cwd()}/${photo.storageKey}`;
      await unlink(absolutePath).catch(() => undefined);
    }

    const photos = await this.prisma.transportRequestPhoto.findMany({
      where: { requestId: input.requestId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    return {
      requestId: input.requestId,
      photos: this.toPhotoResponses(photos),
    };
  }

  async submitCustomerRequest(
    input: SubmitCustomerRequestInput,
  ): Promise<CustomerRequestResponseDto> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: REQUEST_SELECT,
    });

    if (!request) {
      throw new NotFoundException('Transport request not found.');
    }

    const requestOwner = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: { customerId: true, status: true },
    });

    if (!requestOwner) {
      throw new NotFoundException('Transport request not found.');
    }

    if (requestOwner.customerId !== input.customerId) {
      throw new ForbiddenException(
        'You are not allowed to update this request.',
      );
    }

    if (requestOwner.status !== TransportRequestStatus.DRAFT) {
      throw new BadRequestException('Only draft requests can be submitted.');
    }

    if (request.pickupLatitude === null || request.pickupLongitude === null) {
      throw new BadRequestException(
        'Pickup location is required before submission.',
      );
    }

    if (request.dropoffLatitude === null || request.dropoffLongitude === null) {
      throw new BadRequestException(
        'Dropoff location is required before submission.',
      );
    }

    if (!request.isImmediate && request.scheduledPickupAt === null) {
      throw new BadRequestException(
        'Scheduled pickup time is required when request is not immediate.',
      );
    }

    if (
      !request.isImmediate &&
      request.scheduledPickupAt !== null &&
      request.scheduledPickupAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Scheduled pickup time must be in the future.',
      );
    }

    if (!request.itemTitle?.trim()) {
      throw new BadRequestException(
        'Item title is required before submission.',
      );
    }

    if (request.itemType === null) {
      throw new BadRequestException('Item type is required before submission.');
    }

    const service = await this.prisma.service.findUnique({
      where: { id: request.serviceId },
      select: { id: true, key: true },
    });
    if (!service) {
      throw new BadRequestException('Service is invalid for this request.');
    }

    if (service.key === ServiceKey.VEHICLE_TRANSPORT) {
      if (!request.vehicleBrand?.trim()) {
        throw new BadRequestException(
          'vehicleBrand is required for vehicle transport.',
        );
      }
      if (!request.vehicleModel?.trim()) {
        throw new BadRequestException(
          'vehicleModel is required for vehicle transport.',
        );
      }
      if (!request.vehicleManufactureYear) {
        throw new BadRequestException(
          'vehicleManufactureYear is required for vehicle transport.',
        );
      }
      if (
        !request.vehicleEstimatedWeightKg ||
        request.vehicleEstimatedWeightKg <= 0
      ) {
        throw new BadRequestException(
          'vehicleEstimatedWeightKg must be greater than 0 for vehicle transport.',
        );
      }
    }

    if (service.key === ServiceKey.MOTORCYCLE_TRANSPORT) {
      if (!request.motorcycleType) {
        throw new BadRequestException(
          'motorcycleType is required for motorcycle transport.',
        );
      }
      if (!request.motorcycleCondition) {
        throw new BadRequestException(
          'motorcycleCondition is required for motorcycle transport.',
        );
      }
    }

    if (service.key === ServiceKey.GOODS_TRANSPORT) {
      if (!request.goodsShipmentSize) {
        throw new BadRequestException(
          'shipmentSize is required for goods transport.',
        );
      }
      if (!request.goodsDescription?.trim()) {
        throw new BadRequestException(
          'goodsDescription is required for goods transport.',
        );
      }
      if (
        !request.goodsApproximateWeightKg ||
        request.goodsApproximateWeightKg <= 0
      ) {
        throw new BadRequestException(
          'approximateWeightKg must be greater than 0 for goods transport.',
        );
      }
      if (
        !request.goodsNumberOfPieces ||
        !Number.isInteger(request.goodsNumberOfPieces) ||
        request.goodsNumberOfPieces < 1
      ) {
        throw new BadRequestException(
          'numberOfPieces must be an integer greater than or equal to 1 for goods transport.',
        );
      }
      if (
        request.goodsApproximateWeightKg >= 50 &&
        !request.goodsHeavyShipmentType
      ) {
        throw new BadRequestException(
          'heavyShipmentType is required when approximateWeightKg is 50 or more.',
        );
      }
    }

    if (service.key === ServiceKey.FURNITURE_TRANSPORT) {
      if (request.photos.length === 0) {
        throw new BadRequestException(
          'At least one furniture photo is required for furniture transport.',
        );
      }
      if (!request.furnitureDescription?.trim()) {
        throw new BadRequestException(
          'furnitureDescription is required for furniture transport.',
        );
      }
      if (
        !request.furnitureApproximateItemCount ||
        !Number.isInteger(request.furnitureApproximateItemCount) ||
        request.furnitureApproximateItemCount < 1
      ) {
        throw new BadRequestException(
          'approximateItemCount must be an integer greater than or equal to 1 for furniture transport.',
        );
      }
      if (!request.isImmediate) {
        if (!request.scheduledPickupAt) {
          throw new BadRequestException(
            'movingDate is required for furniture transport.',
          );
        }
        if (request.scheduledPickupAt.getTime() < Date.now()) {
          throw new BadRequestException(
            'movingDate cannot be in the past for furniture transport.',
          );
        }
      }
    }

    const updatedRequest = await this.prisma.transportRequest.update({
      where: { id: input.requestId },
      data: {
        status: TransportRequestStatus.PENDING_QUOTES,
        submittedAt: new Date(),
        customerNote: input.customerNote?.trim() || request.customerNote,
      },
      select: {
        ...REQUEST_SELECT,
        service: {
          select: {
            id: true,
            key: true,
            nameEn: true,
            nameAr: true,
            icon: true,
          },
        },
      },
    });

    const dispatchSummary = await this.dispatchSubmittedRequestToEligibleDrivers(
      updatedRequest,
    );

    return this.toResponseDto(updatedRequest, dispatchSummary);
  }

  async getCustomerRequestStatus(
    input: GetCustomerRequestStatusInput,
  ): Promise<CustomerRequestStatusResponseDto> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: REQUEST_STATUS_SELECT,
    });

    if (!request) {
      throw new NotFoundException('Transport request not found.');
    }

    if (request.customerId !== input.customerId) {
      throw new ForbiddenException('You are not allowed to view this request.');
    }

    const offerStats = await this.prisma.driverOffer.aggregate({
      where: {
        requestId: request.id,
        status: { in: [DriverOfferStatus.PENDING, DriverOfferStatus.ACCEPTED] },
      },
      _count: { id: true },
      _min: { price: true },
    });

    const lowestPriceDecimal = offerStats._min.price;
    const lowestOffer = lowestPriceDecimal
      ? await this.prisma.driverOffer.findFirst({
          where: {
            requestId: request.id,
            price: lowestPriceDecimal,
            status: {
              in: [DriverOfferStatus.PENDING, DriverOfferStatus.ACCEPTED],
            },
          },
          select: { currency: true },
          orderBy: { createdAt: 'asc' },
        })
      : null;

    return this.toStatusResponseDto(request, {
      count: offerStats._count.id,
      lowestPrice: lowestPriceDecimal ? Number(lowestPriceDecimal) : null,
      currency: lowestOffer?.currency ?? null,
    });
  }

  async getCustomerRequestOffers(
    input: GetCustomerRequestOffersInput,
  ): Promise<CustomerRequestOffersResponseDto> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Transport request not found.');
    }

    if (request.customerId !== input.customerId) {
      throw new ForbiddenException(
        'You are not allowed to view offers for this request.',
      );
    }

    const offers = await this.prisma.driverOffer.findMany({
      where: { requestId: request.id },
      orderBy: [{ status: 'asc' }, { price: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        requestId: true,
        driverId: true,
        price: true,
        currency: true,
        estimatedPickupAt: true,
        estimatedDeliveryAt: true,
        estimatedDurationMinutes: true,
        message: true,
        status: true,
        createdAt: true,
        acceptedAt: true,
        driver: {
          select: {
            firstName: true,
            lastName: true,
            averageRating: true,
            profilePhotoUrl: true,
            vehicles: {
              where: { isActive: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: {
                documents: {
                  where: { type: 'VEHICLE_PHOTO' },
                  orderBy: { createdAt: 'asc' },
                  take: 1,
                  select: {
                    url: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      requestId: request.id,
      offers: offers.map((offer) => this.toCustomerRequestOfferSummary(offer)),
    };
  }

  async getCustomerRequestTracking(
    input: GetCustomerRequestTrackingInput,
  ): Promise<CustomerRequestTrackingResponseDto> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
        assignedDriverId: true,
        pickupLatitude: true,
        pickupLongitude: true,
        pickupAddress: true,
        pickupPlaceId: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        dropoffAddress: true,
        dropoffPlaceId: true,
        nearDeliveryNotifiedAt: true,
        deliveredAt: true,
        ratingAvailableAt: true,
        pickupProofImageUrl: true,
        deliveryProofImageUrl: true,
        updatedAt: true,
        driverRating: {
          select: {
            id: true,
          },
        },
        driverLocations: {
          orderBy: {
            recordedAt: 'desc',
          },
          take: 1,
          select: {
            latitude: true,
            longitude: true,
            heading: true,
            speed: true,
            accuracy: true,
            recordedAt: true,
          },
        },
        proofPhotos: {
          orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
          select: {
            id: true,
            type: true,
            url: true,
            mimeType: true,
            sizeBytes: true,
            sortOrder: true,
            createdAt: true,
          },
        },
        assignedDriver: {
          select: {
            firstName: true,
            lastName: true,
            vehicles: {
              where: { isActive: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: {
                documents: {
                  where: { type: DriverDocumentType.VEHICLE_PHOTO },
                  orderBy: { createdAt: 'asc' },
                  take: 1,
                  select: { url: true },
                },
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Transport request not found.');
    }

    if (request.customerId !== input.customerId) {
      throw new ForbiddenException(
        'You are not allowed to view tracking for this request.',
      );
    }

    const latestDriverLocation = request.driverLocations[0] ?? null;
    const pickupProofPhotos = this.toTrackingProofPhotoResponses(
      request.proofPhotos.filter(
        (photo) => photo.type === TransportProofPhotoType.PICKUP,
      ),
      request.pickupProofImageUrl,
      TransportProofPhotoType.PICKUP,
    );
    const deliveryProofPhotos = this.toTrackingProofPhotoResponses(
      request.proofPhotos.filter(
        (photo) => photo.type === TransportProofPhotoType.DELIVERY,
      ),
      request.deliveryProofImageUrl,
      TransportProofPhotoType.DELIVERY,
    );

    return {
      requestId: request.id,
      currentStatus: request.status,
      assignedDriverId: request.assignedDriverId,
      driverName: request.assignedDriver
        ? `${request.assignedDriver.firstName} ${request.assignedDriver.lastName}`.trim() ||
          null
        : null,
      driverVehiclePhoto:
        request.assignedDriver?.vehicles[0]?.documents[0]?.url ?? null,
      pickupLocation: {
        latitude: request.pickupLatitude,
        longitude: request.pickupLongitude,
        address: request.pickupAddress,
        placeId: request.pickupPlaceId,
      },
      deliveryLocation: {
        latitude: request.dropoffLatitude,
        longitude: request.dropoffLongitude,
        address: request.dropoffAddress,
        placeId: request.dropoffPlaceId,
      },
      latestDriverLocation: latestDriverLocation
        ? {
            latitude: latestDriverLocation.latitude,
            longitude: latestDriverLocation.longitude,
            heading: latestDriverLocation.heading,
            speed: latestDriverLocation.speed,
            accuracy: latestDriverLocation.accuracy,
            recordedAt: latestDriverLocation.recordedAt.toISOString(),
          }
        : null,
      pickupProofPhotos,
      deliveryProofPhotos,
      nearDeliveryNotifiedAt: request.nearDeliveryNotifiedAt
        ? request.nearDeliveryNotifiedAt.toISOString()
        : null,
      deliveredAt: request.deliveredAt
        ? request.deliveredAt.toISOString()
        : null,
      ratingAvailable:
        Boolean(request.ratingAvailableAt) && !Boolean(request.driverRating),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  async acceptDriverOffer(
    input: AcceptDriverOfferInput,
  ): Promise<CustomerAcceptOfferResponseDto> {
    if (!input.requestId.trim() || !input.offerId.trim()) {
      throw new BadRequestException('requestId and offerId are required.');
    }

    if (!input.confirm) {
      throw new BadRequestException('confirm must be true to accept an offer.');
    }

    if (!input.paymentMethod) {
      throw new BadRequestException('paymentMethod is required.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.transportRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          customerId: true,
          status: true,
          acceptedOfferId: true,
          assignedDriverId: true,
          acceptedAt: true,
          paymentHold: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (!request) {
        throw new NotFoundException('Transport request not found.');
      }

      if (request.customerId !== input.customerId) {
        throw new ForbiddenException(
          'You are not allowed to accept offers for this request.',
        );
      }

      if (!ACCEPTABLE_OFFER_REQUEST_STATUSES.includes(request.status)) {
        throw new BadRequestException(
          'Request is not in a state where offers can be accepted.',
        );
      }

      if (request.acceptedOfferId || request.assignedDriverId) {
        throw new ConflictException(
          'An offer has already been accepted for this request.',
        );
      }

      if (
        request.paymentHold &&
        !RETRYABLE_PAYMENT_HOLD_STATUSES.has(request.paymentHold.status)
      ) {
        throw new ConflictException(
          'A payment attempt is already in progress for this request.',
        );
      }

      if (request.paymentHold) {
        await tx.paymentHold.delete({
          where: { id: request.paymentHold.id },
        });
        await tx.transportRequest.update({
          where: { id: request.id },
          data: {
            paymentStatus: null,
            paymentMethod: null,
            heldAmount: null,
            capturedAmount: null,
            paymentHoldId: null,
            stripePaymentIntentId: null,
          },
        });
      }

      const offer = await tx.driverOffer.findUnique({
        where: { id: input.offerId },
        select: {
          id: true,
          requestId: true,
          driverId: true,
          status: true,
          price: true,
          currency: true,
          estimatedPickupAt: true,
          estimatedDeliveryAt: true,
          estimatedDurationMinutes: true,
          message: true,
          acceptedAt: true,
          createdAt: true,
        },
      });

      if (!offer) {
        throw new NotFoundException('Offer not found.');
      }

      if (offer.requestId !== request.id) {
        throw new BadRequestException('Offer does not belong to this request.');
      }

      if (offer.status !== DriverOfferStatus.PENDING) {
        throw new BadRequestException('Only pending offers can be accepted.');
      }

      const driverProfile = await tx.driverProfile.findUnique({
        where: { id: offer.driverId },
        select: {
          id: true,
          status: true,
          isProfileCompleted: true,
          availability: {
            select: {
              isOnline: true,
            },
          },
          vehicles: {
            where: { isActive: true },
            select: { id: true },
            take: 1,
          },
        },
      });

      if (!driverProfile || !driverProfile.isProfileCompleted) {
        throw new BadRequestException('Offer driver is no longer eligible.');
      }

      if (
        driverProfile.status === DriverStatus.SUSPENDED ||
        driverProfile.status === DriverStatus.REJECTED
      ) {
        throw new BadRequestException('Offer driver is no longer eligible.');
      }

      if (driverProfile.vehicles.length === 0) {
        throw new BadRequestException(
          'Offer driver must have at least one active vehicle.',
        );
      }

      if (driverProfile.status !== DriverStatus.APPROVED) {
        throw new BadRequestException('Offer driver must be approved.');
      }

      if (!driverProfile.availability || !driverProfile.availability.isOnline) {
        throw new BadRequestException(
          'Offer driver must be online and available.',
        );
      }

      const payment = await this.paymentsService.createHoldForAcceptedOffer(tx, {
        customerId: input.customerId,
        requestId: request.id,
        acceptedOfferId: offer.id,
        driverId: offer.driverId,
        amount: offer.price,
        currency: offer.currency,
        paymentMethod: input.paymentMethod,
        stripePaymentMethodId: input.stripePaymentMethodId,
      });
      return {
        acceptedOffer: offer,
        payment,
        updatedRequest: {
          id: request.id,
          status: request.status,
          assignedDriverId: null,
          acceptedOfferId: null,
          acceptedAt: null,
        },
        rejectedOffersCount: 0,
        rejectedOffers: [],
      };
    });

    const response = {
      request: {
        id: result.updatedRequest.id,
        status: result.updatedRequest.status,
        assignedDriverId: result.updatedRequest.assignedDriverId,
        acceptedOfferId: result.updatedRequest.acceptedOfferId,
        acceptedAt: null,
      },
      acceptedOffer: this.toAcceptedOfferResponse(result.acceptedOffer),
      payment: result.payment,
      rejectedOffersCount: result.rejectedOffersCount,
      nextStep: 'CONFIRM_PAYMENT' as const,
    };
    try {
      this.tripsGateway.emitPaymentHeld(input.customerId, result.payment);
    } catch (error) {
      this.logger.error(
        `Failed to emit payment held event for request ${result.updatedRequest.id}.`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return response;
  }

  async finalizeAcceptedOfferPayment(
    input: FinalizeAcceptedOfferPaymentInput,
  ): Promise<CustomerAcceptOfferResponseDto> {
    let result: {
      acceptedOffer: AcceptedOfferSource;
      payment: PaymentSummaryDto;
      updatedRequest: {
        id: string;
        status: TransportRequestStatus;
        assignedDriverId: string | null;
        acceptedOfferId: string | null;
        acceptedAt: Date | null;
      };
      rejectedOffersCount: number;
      rejectedOffers: { id: string; driverId: string }[];
    };

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const request = await tx.transportRequest.findUnique({
          where: { id: input.requestId },
          select: {
            id: true,
            customerId: true,
            status: true,
            acceptedOfferId: true,
            assignedDriverId: true,
            acceptedAt: true,
            paymentHold: {
              select: {
                id: true,
                requestId: true,
                acceptedOfferId: true,
                status: true,
                customerId: true,
                driverId: true,
                amount: true,
                currency: true,
                paymentMethod: true,
                provider: true,
                stripePaymentIntentId: true,
                stripeClientSecret: true,
                stripeChargeId: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        });

        if (!request) {
          throw new NotFoundException('Transport request not found.');
        }

        if (request.customerId !== input.customerId) {
          throw new ForbiddenException('You are not allowed to finalize this request.');
        }

        if (!request.paymentHold) {
          throw new BadRequestException('Payment hold not found.');
        }

        if (!SUCCESSFUL_PAYMENT_HOLD_STATUSES.has(request.paymentHold.status)) {
          throw new BadRequestException('Payment has not been authorized successfully.');
        }

        if (request.acceptedOfferId && request.assignedDriverId) {
          const acceptedOffer = await tx.driverOffer.findUniqueOrThrow({
            where: { id: request.acceptedOfferId },
            select: {
              id: true,
              requestId: true,
              driverId: true,
              price: true,
              currency: true,
              estimatedPickupAt: true,
              estimatedDeliveryAt: true,
              estimatedDurationMinutes: true,
              message: true,
              status: true,
              acceptedAt: true,
              createdAt: true,
            },
          });

          return {
            acceptedOffer,
            payment: this.toPaymentSummaryResponse(request.paymentHold),
            updatedRequest: {
              id: request.id,
              status: request.status,
              assignedDriverId: request.assignedDriverId,
              acceptedOfferId: request.acceptedOfferId,
              acceptedAt: request.acceptedAt,
            },
            rejectedOffersCount: 0,
            rejectedOffers: [],
          };
        }

        if (!ACCEPTABLE_OFFER_REQUEST_STATUSES.includes(request.status)) {
          throw new BadRequestException('Request is not in a state where offers can be accepted.');
        }

        const offer = await tx.driverOffer.findUnique({
          where: { id: request.paymentHold.acceptedOfferId },
          select: {
            id: true,
            requestId: true,
            driverId: true,
            status: true,
            price: true,
            currency: true,
            estimatedPickupAt: true,
            estimatedDeliveryAt: true,
            estimatedDurationMinutes: true,
            message: true,
            acceptedAt: true,
            createdAt: true,
          },
        });

        if (!offer) {
          throw new NotFoundException('Offer not found.');
        }

        if (offer.status !== DriverOfferStatus.PENDING) {
          throw new BadRequestException('Only pending offers can be finalized.');
        }

        const acceptedAt = new Date();
        const acceptedOffer = await tx.driverOffer.update({
          where: { id: offer.id },
          data: {
            status: DriverOfferStatus.ACCEPTED,
            acceptedAt,
            rejectedAt: null,
            cancelledAt: null,
          },
          select: {
            id: true,
            requestId: true,
            driverId: true,
            price: true,
            currency: true,
            estimatedPickupAt: true,
            estimatedDeliveryAt: true,
            estimatedDurationMinutes: true,
            message: true,
            status: true,
            acceptedAt: true,
            createdAt: true,
          },
        });

        const rejectedPendingOffers = await tx.driverOffer.findMany({
          where: {
            requestId: request.id,
            id: { not: offer.id },
            status: DriverOfferStatus.PENDING,
          },
          select: {
            id: true,
            driverId: true,
          },
        });

        const rejectedOffers = await tx.driverOffer.updateMany({
          where: {
            requestId: request.id,
            id: { not: offer.id },
            status: DriverOfferStatus.PENDING,
          },
          data: {
            status: DriverOfferStatus.REJECTED,
            rejectedAt: acceptedAt,
          },
        });

        const updatedRequest = await tx.transportRequest.update({
          where: { id: request.id },
          data: {
            status: TransportRequestStatus.DRIVER_GOING_TO_PICKUP,
            assignedDriverId: offer.driverId,
            acceptedOfferId: offer.id,
            acceptedAt,
          },
          select: {
            id: true,
            status: true,
            assignedDriverId: true,
            acceptedOfferId: true,
            acceptedAt: true,
          },
        });

        return {
          acceptedOffer,
          payment: this.toPaymentSummaryResponse(request.paymentHold),
          updatedRequest,
          rejectedOffersCount: rejectedOffers.count,
          rejectedOffers: rejectedPendingOffers,
        };
      });
    } catch (error) {
      try {
        const request = await this.prisma.transportRequest.findUnique({
          where: { id: input.requestId },
          select: {
            customerId: true,
            assignedDriverId: true,
            acceptedOfferId: true,
            paymentHold: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        });

        if (
          request &&
          request.customerId === input.customerId &&
          !request.assignedDriverId &&
          !request.acceptedOfferId &&
          request.paymentHold &&
          ACTIVE_PAYMENT_HOLD_STATUSES.has(request.paymentHold.status)
        ) {
          await this.paymentsService.cancelRequestPayment({
            customerId: input.customerId,
            requestId: input.requestId,
          });
        }
      } catch (cleanupError) {
        this.logger.error(
          `Failed to rollback payment hold for request ${input.requestId} after finalize error.`,
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
      }

      throw error;
    }

    if (
      !result.updatedRequest.assignedDriverId ||
      !result.updatedRequest.acceptedOfferId ||
      !result.updatedRequest.acceptedAt
    ) {
      throw new BadRequestException('Request assignment failed after payment authorization.');
    }

    const acceptedRequest = await this.prisma.transportRequest.findUnique({
      where: { id: result.updatedRequest.id },
      select: {
        pickupLatitude: true,
        pickupLongitude: true,
        pickupAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        dropoffAddress: true,
      },
    });

    const response = {
      request: {
        id: result.updatedRequest.id,
        status: result.updatedRequest.status,
        assignedDriverId: result.updatedRequest.assignedDriverId,
        acceptedOfferId: result.updatedRequest.acceptedOfferId,
        acceptedAt: result.updatedRequest.acceptedAt.toISOString(),
      },
      acceptedOffer: this.toAcceptedOfferResponse(result.acceptedOffer),
      payment: result.payment,
      rejectedOffersCount: result.rejectedOffersCount,
      nextStep: 'TRACK_REQUEST' as const,
    };

    try {
      this.tripsGateway.emitOfferAccepted(
        {
          tripId: result.updatedRequest.id,
          acceptedOfferId: result.updatedRequest.acceptedOfferId,
          driverId: result.updatedRequest.assignedDriverId,
          customerId: input.customerId,
          agreedPrice: Number(result.acceptedOffer.price),
          currency: result.acceptedOffer.currency,
          pickupLocation: {
            latitude: acceptedRequest?.pickupLatitude ?? 0,
            longitude: acceptedRequest?.pickupLongitude ?? 0,
            address: acceptedRequest?.pickupAddress ?? null,
          },
          dropoffLocation: {
            latitude: acceptedRequest?.dropoffLatitude ?? 0,
            longitude: acceptedRequest?.dropoffLongitude ?? 0,
            address: acceptedRequest?.dropoffAddress ?? null,
          },
          status: result.updatedRequest.status,
        },
        {
          tripId: result.updatedRequest.id,
          status: result.updatedRequest.status,
          updatedAt: result.updatedRequest.acceptedAt.toISOString(),
        },
      );

      for (const rejectedOffer of result.rejectedOffers) {
        this.tripsGateway.emitOfferRejected({
          requestId: result.updatedRequest.id,
          offerId: rejectedOffer.id,
          driverId: rejectedOffer.driverId,
          status: DriverOfferStatus.REJECTED,
          rejectedAt: result.updatedRequest.acceptedAt.toISOString(),
        });
      }

      this.tripsGateway.emitRequestDriverSelected(input.customerId, response);
    } catch (error) {
      this.logger.error(
        `Failed to emit finalized payment events for request ${result.updatedRequest.id}.`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return response;
  }

  async getCustomerHome(
    input: GetCustomerHomeInput,
  ): Promise<CustomerHomeResponseDto> {
    const customer = await this.prisma.user.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const [
      activeRequest,
      recentRequests,
      totalRequests,
      activeRequests,
      completedRequests,
      cancelledRequests,
      pendingQuotesRequests,
    ] = await this.prisma.$transaction([
      this.prisma.transportRequest.findFirst({
        where: {
          customerId: input.customerId,
          status: { in: ACTIVE_REQUEST_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          pickupAddress: true,
          dropoffAddress: true,
          scheduledPickupAt: true,
          submittedAt: true,
          createdAt: true,
          service: {
            select: {
              key: true,
              nameEn: true,
            },
          },
        },
      }),
      this.prisma.transportRequest.findMany({
        where: { customerId: input.customerId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          pickupAddress: true,
          dropoffAddress: true,
          scheduledPickupAt: true,
          submittedAt: true,
          createdAt: true,
          service: {
            select: {
              key: true,
              nameEn: true,
            },
          },
        },
      }),
      this.prisma.transportRequest.count({
        where: { customerId: input.customerId },
      }),
      this.prisma.transportRequest.count({
        where: {
          customerId: input.customerId,
          status: { in: ACTIVE_REQUEST_STATUSES },
        },
      }),
      this.prisma.transportRequest.count({
        where: {
          customerId: input.customerId,
          status: TransportRequestStatus.DELIVERED,
        },
      }),
      this.prisma.transportRequest.count({
        where: {
          customerId: input.customerId,
          status: TransportRequestStatus.CANCELLED,
        },
      }),
      this.prisma.transportRequest.count({
        where: {
          customerId: input.customerId,
          status: TransportRequestStatus.PENDING_QUOTES,
        },
      }),
    ]);

    return {
      customer: {
        id: customer.id,
        fullName: customer.name ?? null,
        email: customer.email,
        phone: null,
        avatarUrl: null,
      },
      activeRequest: activeRequest
        ? this.toCustomerHomeRequestSummary(activeRequest, false)
        : null,
      recentRequests: recentRequests.map((request) =>
        this.toCustomerHomeRequestSummary(request, true),
      ),
      counters: {
        totalRequests,
        activeRequests,
        completedRequests,
        cancelledRequests,
        pendingQuotesRequests,
      },
      notifications: {
        unreadCount: 0,
      },
      // TODO: integrate notification module unread count when notifications are implemented.
    };
  }

  async listCustomerRequests(
    input: ListCustomerRequestsInput,
  ): Promise<CustomerHomeRequestSummaryDto[]> {
    const requests = await this.prisma.transportRequest.findMany({
      where: { customerId: input.customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        pickupAddress: true,
        dropoffAddress: true,
        scheduledPickupAt: true,
        submittedAt: true,
        createdAt: true,
        service: {
          select: {
            key: true,
            nameEn: true,
          },
        },
      },
    });

    return requests.map((request) =>
      this.toCustomerHomeRequestSummary(request, true),
    );
  }

  async deleteCustomerRequest(input: DeleteCustomerRequestInput): Promise<void> {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
        paymentHold: {
          select: { id: true },
        },
        driverAlerts: {
          select: {
            driverId: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Transport request not found.');
    }

    if (request.customerId !== input.customerId) {
      throw new ForbiddenException('You are not allowed to delete this request.');
    }

    if (!DELETABLE_REQUEST_STATUSES.includes(request.status)) {
      throw new ConflictException('Only unassigned requests can be deleted.');
    }

    await this.prisma.$transaction(async (tx) => {
      if (request.paymentHold?.id) {
        if (!HOLD_DELETABLE_REQUEST_STATUSES.includes(request.status)) {
          throw new ConflictException('Requests with active payment holds cannot be deleted.');
        }

        await this.paymentsService.cancelRequestPaymentTx(tx, request.id);
      }

      await tx.transportRequest.delete({
        where: { id: request.id },
      });
    });

    const uniqueDriverIds = [...new Set(request.driverAlerts.map((alert) => alert.driverId))];
    for (const driverId of uniqueDriverIds) {
      this.tripsGateway.emitRequestDeleted(driverId, {
        requestId: request.id,
      });
    }
  }

  private async cleanupFiles(files: MulterFile[]): Promise<void> {
    await Promise.all(
      files.map(async (file) => unlink(file.path).catch(() => undefined)),
    );
  }

  private toPhotoResponses(
    photos: Array<{
      id: string;
      url: string;
      mimeType: string;
      sizeBytes: number;
      sortOrder: number;
      createdAt: Date;
    }>,
  ): RequestPhotoResponse[] {
    return photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      sortOrder: photo.sortOrder,
      createdAt: photo.createdAt.toISOString(),
    }));
  }

  private toTrackingProofPhotoResponses(
    photos: Array<{
      id: string;
      type: TransportProofPhotoType;
      url: string;
      mimeType: string;
      sizeBytes: number;
      sortOrder: number;
      createdAt: Date;
    }>,
    legacyUrl: string | null,
    type: TransportProofPhotoType,
  ): RequestProofPhotoDto[] {
    if (photos.length > 0) {
      return photos.map((photo) => ({
        id: photo.id,
        type: photo.type,
        url: photo.url,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        sortOrder: photo.sortOrder,
        createdAt: photo.createdAt.toISOString(),
      }));
    }

    if (!legacyUrl) {
      return [];
    }

    return [
      {
        id: `legacy-${type.toLowerCase()}`,
        type,
        url: legacyUrl,
        mimeType: 'image/*',
        sizeBytes: 0,
        sortOrder: 1,
        createdAt: new Date(0).toISOString(),
      },
    ];
  }

  private toLocationResponse(
    latitude: number | null,
    longitude: number | null,
    address: string | null,
    placeId: string | null,
  ): RequestLocationResponse {
    return {
      latitude,
      longitude,
      address,
      placeId,
    };
  }

  private toResponseDto(
    request: TransportRequestResponseSource,
    dispatchSummary?: DispatchSummary,
  ): CustomerRequestResponseDto {
    const schedule: ScheduleResponse = {
      isImmediate: request.isImmediate,
      scheduledPickupAt: request.scheduledPickupAt
        ? request.scheduledPickupAt.toISOString()
        : null,
    };

    const itemDetails: ItemDetailsResponse = {
      title: request.itemTitle,
      description: request.itemDescription,
      type: request.itemType,
      brand: request.itemBrand,
      model: request.itemModel,
      year: request.itemYear,
      condition: request.itemCondition,
      weightKg: request.itemWeightKg,
      dimensions: {
        lengthCm: request.itemLengthCm,
        widthCm: request.itemWidthCm,
        heightCm: request.itemHeightCm,
      },
      requiresLoadingHelp: request.requiresLoadingHelp,
      loadingWorkersCount: request.loadingWorkersCount,
      specialInstructions: request.specialInstructions,
    };

    const motorcycleDetails =
      request.itemType === ItemType.MOTORCYCLE ||
      request.motorcycleType !== null ||
      request.motorcycleChassisNumber !== null ||
      request.motorcycleCondition !== null ||
      request.requiresSpecialWrapping ||
      request.requiresDedicatedCarrier
        ? {
            type: request.motorcycleType,
            chassisNumber: request.motorcycleChassisNumber,
            condition: request.motorcycleCondition,
            requiresSpecialWrapping: request.requiresSpecialWrapping,
            requiresDedicatedCarrier: request.requiresDedicatedCarrier,
          }
        : undefined;

    const goodsDetails =
      request.itemType === ItemType.GOODS ||
      request.goodsShipmentSize !== null ||
      request.goodsDescription !== null ||
      request.goodsApproximateWeightKg !== null ||
      request.goodsNumberOfPieces !== null ||
      request.goodsIsFragile ||
      request.goodsRequiresRefrigeration ||
      request.goodsHeavyShipmentType !== null
        ? {
            shipmentSize: request.goodsShipmentSize,
            goodsDescription: request.goodsDescription,
            approximateWeightKg: request.goodsApproximateWeightKg,
            numberOfPieces: request.goodsNumberOfPieces,
            isFragile: request.goodsIsFragile,
            requiresRefrigeration: request.goodsRequiresRefrigeration,
            heavyShipmentType: request.goodsHeavyShipmentType,
          }
        : undefined;

    const furnitureDetails =
      request.itemType === ItemType.FURNITURE ||
      request.furnitureDescription !== null ||
      request.furnitureApproximateItemCount !== null ||
      request.furnitureNeedsHelpers ||
      request.furnitureCustomerCanHelpLoading
        ? {
            description: request.furnitureDescription,
            approximateItemCount: request.furnitureApproximateItemCount,
            needsHelpers: request.furnitureNeedsHelpers,
            movingDate: request.scheduledPickupAt
              ? request.scheduledPickupAt.toISOString()
              : null,
            customerCanHelpLoading: request.furnitureCustomerCanHelpLoading,
          }
        : undefined;

    return {
      id: request.id,
      serviceId: request.serviceId,
      status: request.status,
      submittedAt: request.submittedAt
        ? request.submittedAt.toISOString()
        : null,
      pickupLocation: this.toLocationResponse(
        request.pickupLatitude,
        request.pickupLongitude,
        request.pickupAddress,
        request.pickupPlaceId,
      ),
      dropoffLocation: this.toLocationResponse(
        request.dropoffLatitude,
        request.dropoffLongitude,
        request.dropoffAddress,
        request.dropoffPlaceId,
      ),
      schedule,
      itemDetails,
      vehicleDetails: {
        vin: request.vehicleVin,
        brand: request.vehicleBrand,
        model: request.vehicleModel,
        series: request.vehicleSeries,
        variant: request.vehicleVariant,
        manufactureYear: request.vehicleManufactureYear,
        estimatedWeightKg: request.vehicleEstimatedWeightKg,
        bodyType: request.vehicleBodyType,
        dataSource: request.vehicleDataSource,
        condition: request.vehicleCondition,
        conditionNotes: request.vehicleConditionNotes,
      },
      motorcycleDetails,
      goodsDetails,
      furnitureDetails,
      photos: this.toPhotoResponses(request.photos),
      dispatchSummary,
    };
  }

  private toMotorcycleRequestTitle(motorcycleType: MotorcycleType): string {
    switch (motorcycleType) {
      case MotorcycleType.SPORT_BIKE:
        return 'Sport bike transport';
      case MotorcycleType.CRUISER:
        return 'Cruiser transport';
      case MotorcycleType.ELECTRIC_MOTORCYCLE:
        return 'Electric motorcycle transport';
      case MotorcycleType.SCOOTER:
        return 'Scooter transport';
      case MotorcycleType.OTHER:
      default:
        return 'Motorcycle transport';
    }
  }

  private assertVehicleConditionForService(input: {
    serviceKey: ServiceKey;
    vehicleCondition?: VehicleCondition;
  }): void {
    if (
      input.serviceKey === ServiceKey.VEHICLE_TRANSPORT &&
      !input.vehicleCondition
    ) {
      throw new BadRequestException(
        'vehicleCondition is required for vehicle transport requests.',
      );
    }
  }

  private toStatusResponseDto(
    request: TransportRequestStatusResponseSource,
    offersSummary?: {
      count: number;
      lowestPrice: number | null;
      currency: string | null;
    },
  ): CustomerRequestStatusResponseDto {
    const baseResponse = this.toResponseDto(request);
    const driverName = request.assignedDriver
      ? `${request.assignedDriver.firstName} ${request.assignedDriver.lastName}`.trim()
      : null;
    const primaryVehicle = request.assignedDriver?.vehicles[0] ?? null;
    const vehicleInfo = primaryVehicle
      ? `${primaryVehicle.make} ${primaryVehicle.model} (${primaryVehicle.plateNumber})`
      : null;
    const latestLocation = request.driverLocations[0] ?? null;

    return {
      ...baseResponse,
      service: {
        id: request.service.id,
        key: request.service.key,
        nameEn: request.service.nameEn,
        nameAr: request.service.nameAr,
        icon: request.service.icon ?? null,
      },
      statusLabel: STATUS_LABELS[request.status] ?? request.status,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      quotesSummary: {
        count: offersSummary?.count ?? 0,
        lowestPrice: offersSummary?.lowestPrice ?? null,
        currency: offersSummary?.currency ?? null,
        hasOffers: (offersSummary?.count ?? 0) > 0,
      },
      driverSummary: {
        assigned: Boolean(request.assignedDriverId),
        driverId: request.assignedDriverId,
        driverName: driverName || null,
        vehicleInfo,
      },
      trackingSummary: {
        available: Boolean(latestLocation),
        currentLatitude: latestLocation?.latitude ?? null,
        currentLongitude: latestLocation?.longitude ?? null,
        lastUpdatedAt: latestLocation
          ? latestLocation.recordedAt.toISOString()
          : null,
      },
    };
  }

  private toCustomerHomeRequestSummary(
    request: CustomerHomeRequestSource,
    includeCreatedAt: boolean,
  ): CustomerHomeRequestSummaryDto {
    return {
      id: request.id,
      serviceName: request.service.nameEn ?? null,
      serviceKey: request.service.key,
      status: request.status,
      statusLabel: STATUS_LABELS[request.status] ?? request.status,
      pickupAddress: request.pickupAddress,
      dropoffAddress: request.dropoffAddress,
      scheduledPickupAt: request.scheduledPickupAt
        ? request.scheduledPickupAt.toISOString()
        : null,
      submittedAt: request.submittedAt
        ? request.submittedAt.toISOString()
        : null,
      createdAt: includeCreatedAt ? request.createdAt.toISOString() : undefined,
    };
  }

  private toAcceptedOfferResponse(
    offer: AcceptedOfferSource,
  ): AcceptedOfferResponseDto {
    return {
      id: offer.id,
      requestId: offer.requestId,
      driverId: offer.driverId,
      price: Number(offer.price),
      currency: offer.currency,
      estimatedPickupAt: offer.estimatedPickupAt
        ? offer.estimatedPickupAt.toISOString()
        : null,
      estimatedDeliveryAt: offer.estimatedDeliveryAt
        ? offer.estimatedDeliveryAt.toISOString()
        : null,
      estimatedDurationMinutes: offer.estimatedDurationMinutes,
      message: offer.message,
      status: offer.status,
      acceptedAt: offer.acceptedAt ? offer.acceptedAt.toISOString() : null,
      createdAt: offer.createdAt.toISOString(),
    };
  }

  private toPaymentSummaryResponse(hold: {
    id: string;
    requestId: string;
    acceptedOfferId: string;
    customerId: string;
    driverId: string;
    amount: Prisma.Decimal;
    currency: string;
    paymentMethod: PaymentMethod;
    provider: Prisma.JsonValue | string;
    status: PaymentStatus;
    stripePaymentIntentId: string | null;
    stripeClientSecret: string | null;
    stripeChargeId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentSummaryDto {
    return {
      id: hold.id,
      requestId: hold.requestId,
      acceptedOfferId: hold.acceptedOfferId,
      customerId: hold.customerId,
      driverId: hold.driverId,
      amount: Number(hold.amount),
      heldAmount: ACTIVE_PAYMENT_HOLD_STATUSES.has(hold.status)
        ? Number(hold.amount)
        : 0,
      capturedAmount:
        hold.status === PaymentStatus.PAYMENT_CAPTURED ? Number(hold.amount) : 0,
      currency: hold.currency,
      paymentMethod: hold.paymentMethod,
      provider: hold.provider as PaymentSummaryDto['provider'],
      status: hold.status,
      stripePaymentIntentId: hold.stripePaymentIntentId,
      stripeClientSecret: hold.stripeClientSecret,
      stripeChargeId: hold.stripeChargeId,
      createdAt: hold.createdAt.toISOString(),
      updatedAt: hold.updatedAt.toISOString(),
    };
  }

  private toCustomerRequestOfferSummary(
    offer: CustomerRequestOfferSource,
  ): CustomerRequestOfferSummaryDto {
    const driverName = `${offer.driver.firstName} ${offer.driver.lastName}`.trim();
    const driverVehiclePhoto =
      offer.driver.vehicles[0]?.documents[0]?.url ?? offer.driver.profilePhotoUrl ?? null;
    const driverRating =
      offer.driver.averageRating !== null ? Number(offer.driver.averageRating) : null;
    const estimatedPickupAt = offer.estimatedPickupAt
      ? offer.estimatedPickupAt.toISOString()
      : null;

    return {
      id: offer.id,
      offerId: offer.id,
      requestId: offer.requestId,
      driverId: offer.driverId,
      driverName: driverName || null,
      driverVehiclePhoto,
      driverRating,
      price: Number(offer.price),
      proposedPrice: Number(offer.price),
      currency: offer.currency,
      estimatedPickupAt,
      estimatedArrivalTime: estimatedPickupAt,
      estimatedDeliveryAt: offer.estimatedDeliveryAt
        ? offer.estimatedDeliveryAt.toISOString()
        : null,
      estimatedDurationMinutes: offer.estimatedDurationMinutes,
      message: offer.message,
      status: offer.status,
      offerStatus: offer.status,
      createdAt: offer.createdAt.toISOString(),
      acceptedAt: offer.acceptedAt ? offer.acceptedAt.toISOString() : null,
    };
  }

  private async dispatchSubmittedRequestToEligibleDrivers(
    request: TransportRequestResponseSource & {
      service: {
        id: string;
        key: ServiceKey;
        nameEn: string;
        nameAr: string;
        icon: string | null;
      } | null;
    },
  ): Promise<DispatchSummary> {
    if (!request.service) {
      return {
        eligibleDriversCount: 0,
        connectedDriversCount: 0,
        alertsCreatedCount: 0,
        broadcastedAt: new Date().toISOString(),
        noConnectedDriversAvailable: true,
      };
    }

    const eligibleDrivers = await this.prisma.driverProfile.findMany({
      where: {
        status: DriverStatus.APPROVED,
        isProfileCompleted: true,
        availability: {
          is: {
            isOnline: true,
          },
        },
        vehicles: {
          some: { isActive: true, status: 'APPROVED' },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        isProfileCompleted: true,
        availability: {
          select: {
            isOnline: true,
            baseLatitude: true,
            baseLongitude: true,
            serviceRadiusKm: true,
            acceptsImmediateRequests: true,
            acceptsScheduledRequests: true,
          },
        },
        vehicles: {
          where: { isActive: true, status: 'APPROVED' },
          select: {
            vehicleType: true,
            capacityKg: true,
            lengthCm: true,
            widthCm: true,
            heightCm: true,
            dimensionsAreStandard: true,
            allowedCargoTypes: true,
            workingSchedule: true,
          },
        },
      },
    });

    const filteredDrivers = eligibleDrivers.filter((driver) =>
      this.isEligibleForRealtimeDispatch(request, driver),
    );

    const existingAlerts = await this.prisma.driverRequestAlert.findMany({
      where: {
        requestId: request.id,
        driverId: { in: filteredDrivers.map((driver) => driver.id) },
      },
      select: {
        id: true,
        driverId: true,
        status: true,
        createdAt: true,
      },
    });
    const existingAlertByDriverId = new Map(
      existingAlerts.map((alert) => [alert.driverId, alert]),
    );

    let alertsCreatedCount = 0;
    let connectedDriversCount = 0;
    const broadcastedAt = new Date().toISOString();

    for (const driver of filteredDrivers) {
      const existingAlert = existingAlertByDriverId.get(driver.id);
      const alert =
        existingAlert ??
        (await this.prisma.driverRequestAlert.create({
          data: {
            requestId: request.id,
            driverId: driver.id,
            status: DriverRequestAlertStatus.NEW,
          },
          select: {
            id: true,
            driverId: true,
            status: true,
            createdAt: true,
          },
        }));

      if (!existingAlert) {
        alertsCreatedCount += 1;
      }

      const roomConnections = this.tripsGateway.getDriverConnectionCount(driver.id);
      if (roomConnections > 0) {
        connectedDriversCount += 1;
        this.tripsGateway.emitRequestNew(
          driver.id,
          this.toDriverRequestAlertSummaryPayload(
            request,
            alert,
            this.calculateDistanceKm(
              driver.availability?.baseLatitude ?? null,
              driver.availability?.baseLongitude ?? null,
              request.pickupLatitude,
              request.pickupLongitude,
            ),
          ),
        );
      }
    }

    return {
      eligibleDriversCount: filteredDrivers.length,
      connectedDriversCount,
      alertsCreatedCount,
      broadcastedAt,
      noConnectedDriversAvailable: connectedDriversCount === 0,
    };
  }

  private isEligibleForRealtimeDispatch(
    request: TransportRequestResponseSource & {
      service: { key: ServiceKey } | null;
    },
    driver: EligibleDriverDispatchCandidate,
  ): boolean {
    if (!driver.availability?.isOnline || !request.service) {
      return false;
    }

    if (request.isImmediate && !driver.availability.acceptsImmediateRequests) {
      return false;
    }

    if (!request.isImmediate && !driver.availability.acceptsScheduledRequests) {
      return false;
    }

    if (!this.hasCompatibleVehicleForRequest(request, driver.vehicles)) {
      return false;
    }

    const distanceKm = this.calculateDistanceKm(
      driver.availability.baseLatitude,
      driver.availability.baseLongitude,
      request.pickupLatitude,
      request.pickupLongitude,
    );

    if (
      distanceKm !== null &&
      driver.availability.serviceRadiusKm > 0 &&
      distanceKm > driver.availability.serviceRadiusKm
    ) {
      return false;
    }

    return true;
  }

  private hasCompatibleVehicleForRequest(
    request: TransportRequestResponseSource & {
      service: { key: ServiceKey } | null;
    },
    vehicles: EligibleDriverDispatchCandidate['vehicles'],
  ): boolean {
    if (!request.service) {
      return false;
    }

    const scheduledDate = request.isImmediate
      ? new Date()
      : request.scheduledPickupAt ?? new Date();

    return vehicles.some((vehicle) => {
      if (!this.isServiceCompatibleWithDriverVehicles(request.service!.key, new Set([vehicle.vehicleType]))) {
        return false;
      }

      const normalizedSchedule = this.parseVehicleWorkingSchedule(vehicle.workingSchedule);
      if (!isWorkingScheduleAvailableForDate(normalizedSchedule, scheduledDate)) {
        return false;
      }

      return canVehicleSupportRequestLoad(
        {
          vehicleType: vehicle.vehicleType,
          capacityKg: vehicle.capacityKg,
          lengthCm: vehicle.lengthCm,
          widthCm: vehicle.widthCm,
          heightCm: vehicle.heightCm,
          dimensionsAreStandard: vehicle.dimensionsAreStandard,
          allowedCargoTypes: vehicle.allowedCargoTypes,
          workingSchedule: normalizedSchedule,
        },
        {
          serviceKey: request.service!.key,
          itemType: request.itemType,
          weightKg: request.itemWeightKg,
          lengthCm: request.itemLengthCm,
          widthCm: request.itemWidthCm,
          heightCm: request.itemHeightCm,
        },
      );
    });
  }

  private parseVehicleWorkingSchedule(
    raw: Prisma.JsonValue | null,
  ): WorkingDayScheduleValue[] {
    if (!raw || !Array.isArray(raw)) {
      return [];
    }

    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }
      const value = entry as Record<string, unknown>;
      if (
        typeof value.dayOfWeek !== 'string' ||
        typeof value.isAvailable !== 'boolean' ||
        !Array.isArray(value.timeRanges)
      ) {
        return [];
      }

      return [
        {
          dayOfWeek: value.dayOfWeek as WorkingDayScheduleValue['dayOfWeek'],
          isAvailable: value.isAvailable,
          timeRanges: value.timeRanges.flatMap((range) => {
            if (!range || typeof range !== 'object' || Array.isArray(range)) {
              return [];
            }
            const timeRange = range as Record<string, unknown>;
            if (
              typeof timeRange.startTime !== 'string' ||
              typeof timeRange.endTime !== 'string'
            ) {
              return [];
            }
            return [{ startTime: timeRange.startTime, endTime: timeRange.endTime }];
          }),
        },
      ];
    });
  }

  private isServiceCompatibleWithDriverVehicles(
    serviceKey: ServiceKey,
    vehicleTypes: Set<VehicleType>,
  ): boolean {
    const allowedTypes = DRIVER_SERVICE_VEHICLE_TYPE_MAP[serviceKey];
    return allowedTypes.some((vehicleType) => vehicleTypes.has(vehicleType));
  }

  private calculateDistanceKm(
    originLat: number | null,
    originLng: number | null,
    targetLat: number | null,
    targetLng: number | null,
  ): number | null {
    if (
      originLat === null ||
      originLng === null ||
      targetLat === null ||
      targetLng === null
    ) {
      return null;
    }

    const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(targetLat - originLat);
    const dLng = toRadians(targetLng - originLng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(originLat)) *
        Math.cos(toRadians(targetLat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((earthRadiusKm * c).toFixed(2));
  }

  private toDriverRequestAlertSummaryPayload(
    request: TransportRequestResponseSource & {
      service: {
        id: string;
        key: ServiceKey;
        nameEn: string;
        nameAr: string;
        icon: string | null;
      } | null;
    },
    alert: {
      id: string;
      status: DriverRequestAlertStatus;
      createdAt: Date;
    },
    distanceKm: number | null,
  ): DriverRequestAlertSummaryPayload {
    return {
      alertId: alert.id,
      requestId: request.id,
      alertStatus: alert.status,
      requestStatus: request.status,
      service: request.service
        ? {
            id: request.service.id,
            key: request.service.key,
            nameEn: request.service.nameEn,
            nameAr: request.service.nameAr,
            icon: request.service.icon ?? null,
          }
        : null,
      pickup: {
        latitude: request.pickupLatitude,
        longitude: request.pickupLongitude,
        address: request.pickupAddress,
      },
      dropoff: {
        latitude: request.dropoffLatitude,
        longitude: request.dropoffLongitude,
        address: request.dropoffAddress,
      },
      schedule: {
        isImmediate: request.isImmediate,
        scheduledPickupAt: request.scheduledPickupAt
          ? request.scheduledPickupAt.toISOString()
          : null,
      },
      item: {
        title: request.itemTitle,
        type: request.itemType,
        description: request.itemDescription,
      },
      vehicleDetails: {
        vin: request.vehicleVin,
        brand: request.vehicleBrand,
        model: request.vehicleModel,
        series: request.vehicleSeries,
        variant: request.vehicleVariant,
        manufactureYear: request.vehicleManufactureYear,
        estimatedWeightKg: request.vehicleEstimatedWeightKg,
        bodyType: request.vehicleBodyType,
        condition: request.vehicleCondition,
        conditionNotes: request.vehicleConditionNotes,
      },
      distanceKm,
      createdAt: alert.createdAt.toISOString(),
      submittedAt: request.submittedAt ? request.submittedAt.toISOString() : null,
    };
  }
}
