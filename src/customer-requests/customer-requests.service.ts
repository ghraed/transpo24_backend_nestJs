import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { relative } from 'node:path';
import type { File as MulterFile } from 'multer';
import {
  DriverOfferStatus,
  DriverStatus,
  ItemCondition,
  ItemType,
  MotorcycleCondition,
  MotorcycleType,
  Prisma,
  ServiceKey,
  TransportRequestStatus,
  VehicleCondition,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
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
}

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

const ACCEPTABLE_OFFER_REQUEST_STATUSES: TransportRequestStatus[] = [
  TransportRequestStatus.PENDING_QUOTES,
  TransportRequestStatus.QUOTED,
];

@Injectable()
export class CustomerRequestsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const updatedRequest = await this.prisma.transportRequest.update({
      where: { id: input.requestId },
      data: {
        status: TransportRequestStatus.PENDING_QUOTES,
        submittedAt: new Date(),
        customerNote: input.customerNote?.trim() || request.customerNote,
      },
      select: REQUEST_SELECT,
    });

    // TODO: emit event/job for future quote matching and notifications.
    return this.toResponseDto(updatedRequest);
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
      },
    });

    return {
      requestId: request.id,
      offers: offers.map((offer) => this.toCustomerRequestOfferSummary(offer)),
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

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.transportRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          customerId: true,
          status: true,
          acceptedOfferId: true,
          assignedDriverId: true,
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

      // TODO: authorize/capture customer payment before assigning driver in production.
      // TODO: emit driver.offer.accepted and driver.offer.rejected notifications when notification module is available.

      return {
        acceptedOffer,
        updatedRequest,
        rejectedOffersCount: rejectedOffers.count,
      };
    });

    if (
      !result.updatedRequest.assignedDriverId ||
      !result.updatedRequest.acceptedOfferId ||
      !result.updatedRequest.acceptedAt
    ) {
      throw new BadRequestException(
        'Request assignment failed after accepting offer.',
      );
    }

    return {
      request: {
        id: result.updatedRequest.id,
        status: result.updatedRequest.status,
        assignedDriverId: result.updatedRequest.assignedDriverId,
        acceptedOfferId: result.updatedRequest.acceptedOfferId,
        acceptedAt: result.updatedRequest.acceptedAt.toISOString(),
      },
      acceptedOffer: this.toAcceptedOfferResponse(result.acceptedOffer),
      rejectedOffersCount: result.rejectedOffersCount,
      nextStep: 'TRACK_REQUEST',
    };
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
      photos: this.toPhotoResponses(request.photos),
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

  private toCustomerRequestOfferSummary(
    offer: CustomerRequestOfferSource,
  ): CustomerRequestOfferSummaryDto {
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
      createdAt: offer.createdAt.toISOString(),
      acceptedAt: offer.acceptedAt ? offer.acceptedAt.toISOString() : null,
    };
  }
}
