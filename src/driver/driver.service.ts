import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DayOfWeek,
  DriverEarningStatus,
  DriverOfferStatus,
  DriverRequestAlertStatus,
  DriverDocumentType,
  PushApp,
  DriverStatus,
  DriverVehicleCondition,
  DriverVehicleReviewStatus,
  IdentityDocumentKind,
  ItemType,
  TransportRequestStatus,
  ServiceKey,
  PreferredLanguage,
  Prisma,
  UserRole,
  VehicleCargoType,
  VehicleCondition,
  VehicleType,
} from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { File as MulterFile } from 'multer';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TripsGateway } from '../trips/trips.gateway';
import { DriverAvailabilityDayDto } from './dto/update-driver-availability.dto';
import { DriverAvailabilityResponseDto } from './dto/driver-availability-response.dto';
import {
  DriverOnboardingNextStep,
  DriverOnboardingResponseDto,
} from './dto/driver-onboarding-response.dto';
import {
  DriverOnboardingDocumentResponseDto,
  DriverOnboardingDocumentsStatusResponseDto,
} from './dto/driver-onboarding-documents.dto';
import {
  DriverMeResponseDto,
  DriverNextStep,
  DriverProfileResponseDto,
} from './dto/driver-me-response.dto';
import {
  DriverRequestAlertActionResponseDto,
  DriverRequestAlertsResponseDto,
  DriverRequestAlertSummaryDto,
  DriverRequestDetailsResponseDto,
} from './dto/driver-request-alert.dto';
import {
  DriverAcceptedJobDetailsResponseDto,
  DriverAcceptedJobSummaryDto,
} from './dto/driver-accepted-job.dto';
import {
  DriverOfferResponseDto,
  SendDriverPriceOfferResponseDto,
} from './dto/driver-offer.dto';
import {
  DriverDocumentResponseDto,
  DriverVehicleCompletenessResponseDto,
  DriverVehicleDocumentsResponseDto,
  DriverVehiclesListResponseDto,
  VehicleResponseDto,
} from './dto/driver-vehicle-response.dto';
import {
  normalizeDriverVehicleTypeInput,
  toDriverVehicleApiType,
} from './dto/driver-vehicle-type.util';
import {
  DriverVehicleLoadCapacitiesListResponseDto,
  DriverVehicleLoadCapacityResponseDto,
  UpsertDriverVehicleLoadCapacityDto,
  type WorkingDayScheduleResponseDto,
} from './dto/driver-load-capacity.dto';
import {
  canVehicleSupportRequestLoad,
  isCarCarrierVehicleType,
  isWorkingScheduleAvailableForDate,
  type WorkingDayScheduleValue,
} from './vehicle-load-capacity.util';
import {
  DriverEarningItemResponse,
  DriverEarningsListInput,
  DriverEarningsSummaryInput,
  DriverEarningsSummaryResponse,
  DriverRatingItemResponse,
  DriverRatingsListInput,
  OfferNewPayload,
  PaginatedResponse,
} from '../trips/trips.types';

interface GetDriverMeInput {
  userId: string;
}

interface UpdateDriverProfileInput {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  countryCode?: string | null;
  countryCodes?: string[] | null;
  city?: string | null;
  cities?: string[] | null;
  coverageAreas?: string[] | null;
  fullNameOnId?: string | null;
  dateOfBirth?: Date | null;
  idOrResidencyNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  preferredLanguage?: PreferredLanguage | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  profilePhotoUrl?: string | null;
}

interface GetDriverOnboardingStatusInput {
  userId: string;
}

interface UpsertDriverPersonalInfoInput {
  userId: string;
  fullNameOnId: string;
  dateOfBirth: Date;
  idOrResidencyNumber: string;
  coverageCity?: string;
  coverageAreas?: string[];
}

interface CreateDriverVehicleInput {
  userId: string;
  vehicleType: VehicleType;
  brand: string;
  model: string;
  year: number;
  licensePlateNumber: string;
  condition: DriverVehicleCondition;
  color?: string;
  capacityKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  hasTrailer: boolean;
  insuranceExpiryDate?: Date;
  registrationExpiryDate?: Date;
}

interface ListDriverVehiclesInput {
  userId: string;
}

interface GetDriverVehicleInput {
  userId: string;
  vehicleId: string;
}

interface UpdateDriverVehicleInput {
  userId: string;
  vehicleId: string;
  vehicleType?: VehicleType;
  brand?: string;
  model?: string;
  year?: number;
  licensePlateNumber?: string;
  condition?: DriverVehicleCondition;
  color?: string;
  capacityKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  hasTrailer?: boolean;
  insuranceExpiryDate?: Date;
  registrationExpiryDate?: Date;
}

interface DeactivateDriverVehicleInput {
  userId: string;
  vehicleId: string;
}

interface UpsertDriverVehicleLoadCapacityInput {
  userId: string;
  vehicleId: string;
  name?: string;
  maxLoadKg?: number;
  cargoLengthM?: number;
  cargoWidthM?: number;
  cargoHeightM?: number;
  dimensionsAreStandard?: boolean;
  allowedCargoTypes: VehicleCargoType[];
  workingSchedule: UpsertDriverVehicleLoadCapacityDto['workingSchedule'];
  isDefault?: boolean;
}

interface GetDriverAvailabilityInput {
  userId: string;
}

interface DriverAvailabilityDayInput {
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
}

interface UpdateDriverAvailabilityInput {
  userId: string;
  timezone: string;
  isOnline: boolean;
  serviceRadiusKm: number;
  baseLatitude?: number;
  baseLongitude?: number;
  baseAddress?: string;
  acceptsImmediateRequests: boolean;
  acceptsScheduledRequests: boolean;
  weeklySchedule: DriverAvailabilityDayInput[] | DriverAvailabilityDayDto[];
}

interface UpdateDriverOnlineStatusInput {
  userId: string;
  isOnline: boolean;
}

interface ApproveDriverForTestingInput {
  userId: string;
}

interface SendCustomerTestNotificationInput {
  userId: string;
  email: string;
}

interface GetDriverRequestAlertsInput {
  userId: string;
}

interface GetDriverRequestDetailsInput {
  userId: string;
  requestId: string;
}

interface UpdateDriverRequestAlertInput {
  userId: string;
  requestId: string;
}

interface UploadDriverVehicleDocumentsInput {
  userId: string;
  vehicleId: string;
  insuranceExpiryDate?: Date;
  registrationExpiryDate?: Date;
  files: {
    frontPhoto?: MulterFile[];
    rearPhoto?: MulterFile[];
    sidePhoto?: MulterFile[];
    licensePlatePhoto?: MulterFile[];
    registrationFrontDocument?: MulterFile[];
    registrationBackDocument?: MulterFile[];
    insuranceDocument?: MulterFile[];
    driverLicenseFront?: MulterFile[];
    driverLicenseBack?: MulterFile[];
    identityDocument?: MulterFile[];
    vehicleRegistration?: MulterFile[];
    vehicleInsurance?: MulterFile[];
    vehiclePhotos?: MulterFile[];
  };
}

interface GetDriverOnboardingDocumentsInput {
  userId: string;
}

interface SubmitDriverOnboardingDocumentsReviewInput {
  userId: string;
}

interface UploadDriverOnboardingDocumentsInput {
  userId: string;
  idDocumentKind?: IdentityDocumentKind;
  idExpiryDate?: Date;
  drivingLicenseExpiryDate?: Date;
  files: {
    personalSelfie?: MulterFile[];
    idFront?: MulterFile[];
    idBack?: MulterFile[];
    drivingLicense?: MulterFile[];
    selfIdentityVerification?: MulterFile[];
  };
}

interface SendDriverPriceOfferInput {
  userId: string;
  requestId: string;
  price: number;
  currency: string;
  estimatedPickupAt?: Date;
  estimatedDeliveryAt?: Date;
  estimatedDurationMinutes?: number;
  message?: string;
}

interface GetDriverAcceptedJobsInput {
  userId: string;
}

interface GetDriverAcceptedJobDetailsInput {
  userId: string;
  requestId: string;
}

type DriverProfileSource = {
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
  dateOfBirth: Date | null;
  idOrResidencyNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  preferredLanguage: PreferredLanguage | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  profilePhotoUrl: string | null;
  identityDocumentKind: IdentityDocumentKind | null;
  submittedForReviewAt: Date | null;
  status: DriverStatus;
  isProfileCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type DriverMeSource = {
  id: string;
  email: string;
  role: UserRole;
  driverProfile: DriverProfileSource | null;
};

type VehicleSource = {
  id: string;
  driverId: string;
  vehicleType: VehicleType;
  loadProfileName: string | null;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  condition: DriverVehicleCondition;
  color: string | null;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  dimensionsAreStandard: boolean;
  allowedCargoTypes: VehicleCargoType[];
  workingSchedule: Prisma.JsonValue | null;
  isDefaultLoadProfile: boolean;
  hasTrailer: boolean;
  insuranceExpiryDate: Date | null;
  registrationExpiryDate: Date | null;
  status: DriverVehicleReviewStatus;
  rejectionReason: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentSource = {
  id: string;
  vehicleId: string | null;
  type: DriverDocumentType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionReason: string | null;
  expiresAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

type AvailabilityScheduleSource = {
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
};

type AvailabilitySource = {
  id: string;
  driverId: string;
  timezone: string;
  isOnline: boolean;
  serviceRadiusKm: number;
  baseLatitude: number | null;
  baseLongitude: number | null;
  baseAddress: string | null;
  acceptsImmediateRequests: boolean;
  acceptsScheduledRequests: boolean;
  createdAt: Date;
  updatedAt: Date;
  schedule: AvailabilityScheduleSource[];
};

const DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.PERSONAL_SELFIE,
  DriverDocumentType.ID_FRONT,
  DriverDocumentType.ID_BACK,
  DriverDocumentType.DRIVING_LICENSE,
];

const DRIVER_ONBOARDING_OPTIONAL_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.SELF_IDENTITY_VERIFICATION,
];

const DRIVER_ONBOARDING_ALL_DOCUMENT_TYPES: DriverDocumentType[] = [
  ...DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES,
  ...DRIVER_ONBOARDING_OPTIONAL_DOCUMENT_TYPES,
];

type RequestAlertSource = {
  id: string;
  requestId: string;
  driverId: string;
  status: DriverRequestAlertStatus;
  seenAt: Date | null;
  acceptedAt: Date | null;
  ignoredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DriverOfferSource = {
  id: string;
  requestId: string;
  driverId: string;
  alertId: string | null;
  price: Prisma.Decimal;
  currency: string;
  estimatedPickupAt: Date | null;
  estimatedDeliveryAt: Date | null;
  estimatedDurationMinutes: number | null;
  message: string | null;
  status: DriverOfferStatus;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DriverEarningSource = {
  id: string;
  tripId: string;
  grossAmount: Prisma.Decimal;
  platformFeeAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  currency: string;
  status: DriverEarningStatus;
  createdAt: Date;
  availableAt: Date | null;
  paidOutAt: Date | null;
};

type DriverRatingSource = {
  id: string;
  tripId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  customer: {
    name: string;
  } | null;
};

type RequestDetailsSource = {
  id: string;
  customerId: string;
  status: TransportRequestStatus;
  assignedDriverId: string | null;
  submittedAt: Date | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  pickupAddress: string | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
  dropoffAddress: string | null;
  isImmediate: boolean;
  scheduledPickupAt: Date | null;
  itemTitle: string | null;
  itemType: ItemType | null;
  itemDescription: string | null;
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
  vehicleCondition: VehicleCondition | null;
  vehicleConditionNotes: string | null;
  itemCondition: string | null;
  itemWeightKg: number | null;
  itemLengthCm: number | null;
  itemWidthCm: number | null;
  itemHeightCm: number | null;
  requiresLoadingHelp: boolean;
  loadingWorkersCount: number | null;
  specialInstructions: string | null;
  service: {
    id: string;
    key: ServiceKey;
    nameEn: string;
    nameAr: string;
    icon: string;
  } | null;
  customer: {
    name: string;
  } | null;
  photos: Array<{
    id: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
    createdAt: Date;
  }>;
  driverAlerts: RequestAlertSource[];
};

type AcceptedJobRequestSource = {
  id: string;
  status: TransportRequestStatus;
  acceptedAt: Date | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  pickupAddress: string | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
  dropoffAddress: string | null;
  isImmediate: boolean;
  scheduledPickupAt: Date | null;
  itemTitle: string | null;
  itemType: ItemType | null;
  itemDescription: string | null;
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
  vehicleCondition: VehicleCondition | null;
  vehicleConditionNotes: string | null;
  itemCondition: string | null;
  itemWeightKg: number | null;
  itemLengthCm: number | null;
  itemWidthCm: number | null;
  itemHeightCm: number | null;
  requiresLoadingHelp: boolean;
  loadingWorkersCount: number | null;
  specialInstructions: string | null;
  service: {
    id: string;
    key: ServiceKey;
    nameEn: string;
    nameAr: string;
    icon: string;
  } | null;
  customer: {
    name: string;
  } | null;
  photos: Array<{
    id: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
    createdAt: Date;
  }>;
  acceptedOffer: DriverOfferSource | null;
};

const DRIVER_ME_SELECT = {
  id: true,
  email: true,
  role: true,
  driverProfile: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      phone: true,
      countryCode: true,
      countryCodes: true,
      city: true,
      cities: true,
      coverageAreas: true,
      fullNameOnId: true,
      dateOfBirth: true,
      idOrResidencyNumber: true,
      addressLine1: true,
      addressLine2: true,
      postalCode: true,
      preferredLanguage: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      profilePhotoUrl: true,
      identityDocumentKind: true,
      submittedForReviewAt: true,
      status: true,
      isProfileCompleted: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

const DRIVER_VEHICLE_SELECT = {
  id: true,
  driverId: true,
  vehicleType: true,
  loadProfileName: true,
  make: true,
  model: true,
  year: true,
  plateNumber: true,
  condition: true,
  color: true,
  capacityKg: true,
  lengthCm: true,
  widthCm: true,
  heightCm: true,
  dimensionsAreStandard: true,
  allowedCargoTypes: true,
  workingSchedule: true,
  isDefaultLoadProfile: true,
  hasTrailer: true,
  insuranceExpiryDate: true,
  registrationExpiryDate: true,
  status: true,
  rejectionReason: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DriverVehicleSelect;

const DRIVER_DOCUMENT_SELECT = {
  id: true,
  vehicleId: true,
  type: true,
  url: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  rejectionReason: true,
  expiresAt: true,
  reviewedAt: true,
  createdAt: true,
} satisfies Prisma.DriverDocumentSelect;

const DRIVER_REQUEST_ALERT_SELECT = {
  id: true,
  requestId: true,
  driverId: true,
  status: true,
  seenAt: true,
  acceptedAt: true,
  ignoredAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DriverRequestAlertSelect;

const DRIVER_REQUEST_DETAILS_SELECT = {
  id: true,
  status: true,
  assignedDriverId: true,
  submittedAt: true,
  pickupLatitude: true,
  pickupLongitude: true,
  pickupAddress: true,
  dropoffLatitude: true,
  dropoffLongitude: true,
  dropoffAddress: true,
  isImmediate: true,
  scheduledPickupAt: true,
  itemTitle: true,
  itemType: true,
  itemDescription: true,
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
  vehicleCondition: true,
  vehicleConditionNotes: true,
  itemCondition: true,
  itemWeightKg: true,
  itemLengthCm: true,
  itemWidthCm: true,
  itemHeightCm: true,
  requiresLoadingHelp: true,
  loadingWorkersCount: true,
  specialInstructions: true,
  service: {
    select: {
      id: true,
      key: true,
      nameEn: true,
      nameAr: true,
      icon: true,
    },
  },
  customerId: true,
  customer: {
    select: {
      name: true,
    },
  },
  photos: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      sortOrder: true,
      createdAt: true,
    },
  },
  driverAlerts: {
    select: DRIVER_REQUEST_ALERT_SELECT,
  },
} satisfies Prisma.TransportRequestSelect;

const DRIVER_AVAILABILITY_SELECT = {
  id: true,
  driverId: true,
  timezone: true,
  isOnline: true,
  serviceRadiusKm: true,
  baseLatitude: true,
  baseLongitude: true,
  baseAddress: true,
  acceptsImmediateRequests: true,
  acceptsScheduledRequests: true,
  createdAt: true,
  updatedAt: true,
  schedule: {
    select: {
      dayOfWeek: true,
      isAvailable: true,
      startTime: true,
      endTime: true,
    },
    orderBy: { dayOfWeek: 'asc' },
  },
} satisfies Prisma.DriverAvailabilitySelect;

const DRIVER_OFFER_SELECT = {
  id: true,
  requestId: true,
  driverId: true,
  alertId: true,
  price: true,
  currency: true,
  estimatedPickupAt: true,
  estimatedDeliveryAt: true,
  estimatedDurationMinutes: true,
  message: true,
  status: true,
  expiresAt: true,
  acceptedAt: true,
  rejectedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DriverOfferSelect;

const MAX_VEHICLE_PHOTOS = 8;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEK_DAYS_ORDER: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
];
const SUPPORTED_OFFER_CURRENCIES = new Set([
  'CHF',
  'EUR',
  'AED',
  'SAR',
  'QAR',
  'USD',
]);
const ACCEPTED_JOB_REQUEST_STATUSES: TransportRequestStatus[] = [
  TransportRequestStatus.ACCEPTED,
  TransportRequestStatus.DRIVER_ASSIGNED,
  TransportRequestStatus.DRIVER_GOING_TO_PICKUP,
  TransportRequestStatus.DRIVER_ARRIVED_PICKUP,
  TransportRequestStatus.DRIVER_GOING_TO_DROPOFF,
];

const CANONICAL_VEHICLE_DOCUMENT_TYPES = {
  frontPhoto: DriverDocumentType.VEHICLE_FRONT_PHOTO,
  rearPhoto: DriverDocumentType.VEHICLE_REAR_PHOTO,
  sidePhoto: DriverDocumentType.VEHICLE_SIDE_PHOTO,
  licensePlatePhoto: DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO,
  registrationFrontDocument: DriverDocumentType.VEHICLE_REGISTRATION_FRONT,
  registrationBackDocument: DriverDocumentType.VEHICLE_REGISTRATION_BACK,
  insuranceDocument: DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT,
} as const;

const LEGACY_COMPATIBLE_VEHICLE_DOCUMENT_TYPES = {
  registration: DriverDocumentType.VEHICLE_REGISTRATION,
  insurance: DriverDocumentType.VEHICLE_INSURANCE,
  photo: DriverDocumentType.VEHICLE_PHOTO,
} as const;

@Injectable()
export class DriverService {
  private readonly logger = new Logger(DriverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsGateway: TripsGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getMe(input: GetDriverMeInput): Promise<DriverMeResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Driver account not found.');
    }

    if (!user.driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId: user.driverProfile.id },
      select: DRIVER_AVAILABILITY_SELECT,
    });

    return this.toDriverMeResponse(user, availability);
  }

  async getOnboardingStatus(
    input: GetDriverOnboardingStatusInput,
  ): Promise<DriverOnboardingResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Driver account not found.');
    }

    if (!user.driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    return this.toDriverOnboardingResponse(user.driverProfile);
  }

  async getOnboardingDocumentsStatus(
    input: GetDriverOnboardingDocumentsInput,
  ): Promise<DriverOnboardingDocumentsStatusResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Driver account not found.');
    }

    if (!user.driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const documents = await this.prisma.driverDocument.findMany({
      where: {
        driverId: user.driverProfile.id,
        vehicleId: null,
        type: { in: DRIVER_ONBOARDING_ALL_DOCUMENT_TYPES },
      },
      orderBy: { createdAt: 'desc' },
      select: DRIVER_DOCUMENT_SELECT,
    });

    return this.toOnboardingDocumentsStatusResponse(
      user.driverProfile,
      documents,
    );
  }

  async uploadOnboardingDocuments(
    input: UploadDriverOnboardingDocumentsInput,
  ): Promise<DriverOnboardingDocumentsStatusResponseDto> {
    const profile = await this.getDriverProfileForOnboardingDocuments(
      input.userId,
    );
    const files = input.files;
    const uploadedFiles = this.flattenAnyUploadFiles(files);

    if (uploadedFiles.length === 0) {
      throw new BadRequestException(
        'At least one onboarding document is required.',
      );
    }

    if (!profile.isProfileCompleted) {
      await this.cleanupFiles(uploadedFiles);
      throw new BadRequestException(
        'Driver profile must be completed before uploading onboarding documents.',
      );
    }

    if (input.idExpiryDate) {
      this.assertExpiryDateNotPast(input.idExpiryDate, 'ID expiry date');
    }

    if (input.drivingLicenseExpiryDate) {
      this.assertExpiryDateNotPast(
        input.drivingLicenseExpiryDate,
        'Driving license expiry date',
      );
    }

    const isUploadingIdentityDocument =
      Boolean(files.idFront?.length) || Boolean(files.idBack?.length);

    if (isUploadingIdentityDocument && !input.idDocumentKind) {
      await this.cleanupFiles(uploadedFiles);
      throw new BadRequestException(
        'Choose whether you are uploading an ID or residency card.',
      );
    }

    if (
      isUploadingIdentityDocument &&
      input.idDocumentKind === IdentityDocumentKind.RESIDENCY_CARD &&
      !input.idExpiryDate
    ) {
      await this.cleanupFiles(uploadedFiles);
      throw new BadRequestException('Residency expiry date is required.');
    }

    const newRows = this.buildOnboardingDocumentRows(profile.id, input);
    const replaceableTypes = [...new Set(newRows.map((row) => row.type))];
    const existingDocuments =
      replaceableTypes.length > 0
        ? await this.prisma.driverDocument.findMany({
            where: {
              driverId: profile.id,
              vehicleId: null,
              type: { in: replaceableTypes },
            },
            select: {
              id: true,
              storageKey: true,
            },
          })
        : [];

    try {
      await this.prisma.$transaction(async (tx) => {
        if (existingDocuments.length > 0) {
          await tx.driverDocument.deleteMany({
            where: {
              id: { in: existingDocuments.map((document) => document.id) },
            },
          });
        }

        if (newRows.length > 0) {
          await tx.driverDocument.createMany({
            data: newRows,
          });
        }

        if (isUploadingIdentityDocument) {
          await tx.driverProfile.update({
            where: { id: profile.id },
            data: {
              identityDocumentKind: input.idDocumentKind,
            },
          });
          profile.identityDocumentKind = input.idDocumentKind ?? null;
        }

        if (profile.status === DriverStatus.PENDING_REVIEW) {
          await tx.driverProfile.update({
            where: { id: profile.id },
            data: {
              status: DriverStatus.PENDING_DOCUMENTS,
              submittedForReviewAt: null,
            },
          });
          profile.status = DriverStatus.PENDING_DOCUMENTS;
          profile.submittedForReviewAt = null;
        }
      });
    } catch (error) {
      await this.cleanupFiles(uploadedFiles);
      throw error;
    }

    await this.cleanupStorageKeys(
      existingDocuments
        .map((document) => document.storageKey)
        .filter((value): value is string => Boolean(value)),
    );

    const documents = await this.prisma.driverDocument.findMany({
      where: {
        driverId: profile.id,
        vehicleId: null,
        type: { in: DRIVER_ONBOARDING_ALL_DOCUMENT_TYPES },
      },
      orderBy: { createdAt: 'desc' },
      select: DRIVER_DOCUMENT_SELECT,
    });

    return this.toOnboardingDocumentsStatusResponse(profile, documents);
  }

  async submitOnboardingDocumentsForReview(
    input: SubmitDriverOnboardingDocumentsReviewInput,
  ): Promise<DriverOnboardingDocumentsStatusResponseDto> {
    const profile = await this.getDriverProfileForOnboardingDocuments(
      input.userId,
    );

    if (!profile.isProfileCompleted) {
      throw new BadRequestException(
        'Driver profile must be completed before submitting documents for review.',
      );
    }

    if (profile.status === DriverStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Suspended drivers cannot submit documents for review.',
      );
    }

    const documents = await this.prisma.driverDocument.findMany({
      where: {
        driverId: profile.id,
        vehicleId: null,
        type: { in: DRIVER_ONBOARDING_ALL_DOCUMENT_TYPES },
      },
      orderBy: { createdAt: 'desc' },
      select: DRIVER_DOCUMENT_SELECT,
    });

    const latestDocuments = this.uniqueLatestDocumentsByType(documents);
    const missingDocuments =
      this.getMissingOnboardingDocuments(latestDocuments);
    if (missingDocuments.length > 0) {
      throw new BadRequestException(
        `Missing required documents: ${missingDocuments.join(', ')}.`,
      );
    }

    const expiredDocument = latestDocuments.find(
      (document) =>
        document.expiresAt &&
        DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES.includes(document.type) &&
        document.expiresAt.getTime() < Date.now(),
    );

    if (expiredDocument) {
      throw new BadRequestException(
        `${expiredDocument.type} is expired and cannot be submitted for review.`,
      );
    }

    const submittedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.driverDocument.updateMany({
        where: {
          driverId: profile.id,
          vehicleId: null,
          type: { in: DRIVER_ONBOARDING_ALL_DOCUMENT_TYPES },
          status: {
            in: [
              DocumentStatus.UPLOADED,
              DocumentStatus.REJECTED,
              DocumentStatus.PENDING_REVIEW,
            ],
          },
        },
        data: {
          status: DocumentStatus.UNDER_REVIEW,
          rejectionReason: null,
          reviewedAt: null,
        },
      }),
      this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: {
          status: DriverStatus.PENDING_REVIEW,
          submittedForReviewAt: submittedAt,
        },
      }),
    ]);

    profile.status = DriverStatus.PENDING_REVIEW;
    profile.submittedForReviewAt = submittedAt;

    const updatedDocuments = await this.prisma.driverDocument.findMany({
      where: {
        driverId: profile.id,
        vehicleId: null,
        type: { in: DRIVER_ONBOARDING_ALL_DOCUMENT_TYPES },
      },
      orderBy: { createdAt: 'desc' },
      select: DRIVER_DOCUMENT_SELECT,
    });

    return this.toOnboardingDocumentsStatusResponse(profile, updatedDocuments);
  }

  async upsertPersonalInfo(
    input: UpsertDriverPersonalInfoInput,
  ): Promise<DriverOnboardingResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Driver account not found.');
    }

    if (!user.driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const normalizedCoverageCity =
      input.coverageCity?.trim() || user.driverProfile.city;
    const normalizedCoverageAreas = this.normalizeCoverageAreas(
      input.coverageAreas ?? user.driverProfile.coverageAreas,
    );

    if (!normalizedCoverageCity && normalizedCoverageAreas.length === 0) {
      throw new BadRequestException(
        'At least one coverage city or area is required.',
      );
    }

    const updatedProfile = await this.persistDriverProfileUpdate({
      userId: input.userId,
      existingProfile: user.driverProfile,
      changes: {
        fullNameOnId: input.fullNameOnId,
        dateOfBirth: input.dateOfBirth,
        idOrResidencyNumber: input.idOrResidencyNumber,
        city: input.coverageCity,
        coverageAreas: input.coverageAreas,
      },
    });

    return this.toDriverOnboardingResponse(updatedProfile);
  }

  async updateProfile(
    input: UpdateDriverProfileInput,
  ): Promise<DriverMeResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Driver account not found.');
    }

    const existingProfile = user.driverProfile;

    if (!existingProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const updatedProfile = await this.persistDriverProfileUpdate({
      userId: input.userId,
      existingProfile,
      changes: input,
    });

    const mappedUser: DriverMeSource = {
      id: user.id,
      email: user.email,
      role: user.role,
      driverProfile: updatedProfile,
    };

    return this.toDriverMeResponse(mappedUser);
  }

  async getAvailability(
    input: GetDriverAvailabilityInput,
  ): Promise<DriverAvailabilityResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);

    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId: profile.id },
      select: DRIVER_AVAILABILITY_SELECT,
    });

    return this.toAvailabilityResponse(profile, availability);
  }

  async updateAvailability(
    input: UpdateDriverAvailabilityInput,
  ): Promise<DriverAvailabilityResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);

    if (!profile.isProfileCompleted) {
      throw new BadRequestException(
        'Driver profile must be completed before setting availability.',
      );
    }

    if (!this.isValidIanaTimezone(input.timezone)) {
      throw new BadRequestException('timezone must be a valid IANA timezone.');
    }

    if (input.serviceRadiusKm < 1 || input.serviceRadiusKm > 500) {
      throw new BadRequestException(
        'serviceRadiusKm must be between 1 and 500.',
      );
    }

    if (
      (input.baseLatitude === undefined) !==
      (input.baseLongitude === undefined)
    ) {
      throw new BadRequestException(
        'baseLatitude and baseLongitude must be provided together.',
      );
    }

    if (
      input.baseLatitude !== undefined &&
      (input.baseLatitude < -90 || input.baseLatitude > 90)
    ) {
      throw new BadRequestException('baseLatitude must be between -90 and 90.');
    }

    if (
      input.baseLongitude !== undefined &&
      (input.baseLongitude < -180 || input.baseLongitude > 180)
    ) {
      throw new BadRequestException(
        'baseLongitude must be between -180 and 180.',
      );
    }

    if (!input.acceptsImmediateRequests && !input.acceptsScheduledRequests) {
      throw new BadRequestException(
        'At least one of acceptsImmediateRequests or acceptsScheduledRequests must be true.',
      );
    }

    const normalizedSchedule = this.validateAndNormalizeWeeklySchedule(
      input.weeklySchedule,
    );
    await this.ensureDriverVehicleDocumentsReady(profile.id);

    const shouldSetOnline = input.isOnline;
    if (shouldSetOnline) {
      this.ensureDriverCanGoOnline(profile.status, true);
    }

    const availability = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.driverAvailability.upsert({
        where: { driverId: profile.id },
        update: {
          timezone: input.timezone,
          isOnline: shouldSetOnline,
          serviceRadiusKm: Math.round(input.serviceRadiusKm),
          baseLatitude: input.baseLatitude ?? null,
          baseLongitude: input.baseLongitude ?? null,
          baseAddress: input.baseAddress?.trim() || null,
          acceptsImmediateRequests: input.acceptsImmediateRequests,
          acceptsScheduledRequests: input.acceptsScheduledRequests,
        },
        create: {
          driverId: profile.id,
          timezone: input.timezone,
          isOnline: shouldSetOnline,
          serviceRadiusKm: Math.round(input.serviceRadiusKm),
          baseLatitude: input.baseLatitude ?? null,
          baseLongitude: input.baseLongitude ?? null,
          baseAddress: input.baseAddress?.trim() || null,
          acceptsImmediateRequests: input.acceptsImmediateRequests,
          acceptsScheduledRequests: input.acceptsScheduledRequests,
        },
        select: { id: true },
      });

      await tx.driverAvailabilitySchedule.deleteMany({
        where: { availabilityId: upserted.id },
      });

      await tx.driverAvailabilitySchedule.createMany({
        data: normalizedSchedule.map((day) => ({
          availabilityId: upserted.id,
          dayOfWeek: day.dayOfWeek,
          isAvailable: day.isAvailable,
          startTime: day.startTime,
          endTime: day.endTime,
        })),
      });

      return tx.driverAvailability.findUnique({
        where: { id: upserted.id },
        select: DRIVER_AVAILABILITY_SELECT,
      });
    });

    if (!availability) {
      throw new NotFoundException(
        'Driver availability not found after update.',
      );
    }

    const nextStatus = this.resolveStatusAfterAvailability(profile.status);
    if (nextStatus !== profile.status) {
      await this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: { status: nextStatus },
      });
      profile.status = nextStatus;
    }

    return this.toAvailabilityResponse(profile, availability);
  }

  async updateOnlineStatus(
    input: UpdateDriverOnlineStatusInput,
  ): Promise<DriverAvailabilityResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId: profile.id },
      select: DRIVER_AVAILABILITY_SELECT,
    });

    if (!availability) {
      throw new BadRequestException(
        'Set availability first before changing online status.',
      );
    }

    const isAvailabilityValid = this.isStoredAvailabilityValid(availability);
    if (!isAvailabilityValid) {
      throw new BadRequestException(
        'Availability settings are incomplete or invalid.',
      );
    }

    const hasEligibleVehicle = await this.hasVehicleReadyForAvailability(
      profile.id,
    );
    this.ensureDriverCanGoOnline(
      profile.status,
      hasEligibleVehicle,
      input.isOnline,
    );

    const updated = await this.prisma.driverAvailability.update({
      where: { id: availability.id },
      data: { isOnline: input.isOnline },
      select: DRIVER_AVAILABILITY_SELECT,
    });

    return this.toAvailabilityResponse(profile, updated);
  }

  async approveForTesting(
    input: ApproveDriverForTestingInput,
  ): Promise<DriverMeResponseDto> {
    this.assertTestingModeEnabled();

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Driver account not found.');
    }

    if (!user.driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const profileId = user.driverProfile.id;
    const vehicles = await this.prisma.driverVehicle.findMany({
      where: {
        driverId: profileId,
      },
      orderBy: [{ isDefaultLoadProfile: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        documents: {
          orderBy: { createdAt: 'asc' },
          select: DRIVER_DOCUMENT_SELECT,
        },
      },
    });

    const activeVehicleIds = vehicles.map((vehicle) => vehicle.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({
        where: { id: profileId },
        data: {
          status: DriverStatus.APPROVED,
        },
      });

      if (activeVehicleIds.length === 0) {
        return;
      }

      await tx.driverVehicle.updateMany({
        where: {
          driverId: profileId,
          id: { in: activeVehicleIds },
        },
        data: {
          status: DriverVehicleReviewStatus.APPROVED,
          isActive: true,
        },
      });

      await tx.driverVehicle.updateMany({
        where: {
          driverId: profileId,
          id: { notIn: activeVehicleIds },
        },
        data: {
          status: DriverVehicleReviewStatus.INACTIVE,
          isActive: false,
        },
      });
    });

    return this.getMe({ userId: input.userId });
  }

  async sendCustomerTestNotification(
    input: SendCustomerTestNotificationInput,
  ): Promise<{ success: true; email: string; customerId: string }> {
    this.assertTestingModeEnabled();

    await this.ensureDriverProfile(input.userId);

    const normalizedEmail = input.email.trim().toLowerCase();
    const customer = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        role: true,
        pushTokens: {
          where: {
            app: PushApp.CUSTOMER,
            isActive: true,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!customer || customer.role !== UserRole.CUSTOMER) {
      throw new NotFoundException('Customer account not found.');
    }

    if (customer.pushTokens.length === 0) {
      throw new BadRequestException(
        'Customer has no active push token. Login on the customer app and register notifications first.',
      );
    }

    await this.notificationsService.sendToUsers({
      userIds: [customer.id],
      app: PushApp.CUSTOMER,
      title: 'Test notification',
      body: 'Driver app test notification.',
      type: 'TEST_NOTIFICATION',
      data: {
        email: normalizedEmail,
        requestedByDriverId: input.userId,
      },
    });

    return {
      success: true,
      email: normalizedEmail,
      customerId: customer.id,
    };
  }

  async getDriverRequestAlerts(
    input: GetDriverRequestAlertsInput,
  ): Promise<DriverRequestAlertsResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    this.ensureDriverOnboardingForAlerts(profile);

    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId: profile.id },
      select: {
        id: true,
        isOnline: true,
        baseLatitude: true,
        baseLongitude: true,
        serviceRadiusKm: true,
      },
    });

    if (!availability) {
      throw new BadRequestException(
        'Driver availability must be configured first.',
      );
    }

    if (!availability.isOnline) {
      return { alerts: [] };
    }

    const requests = await this.prisma.transportRequest.findMany({
      where: {
        status: TransportRequestStatus.PENDING_QUOTES,
        pickupLatitude: { not: null },
        pickupLongitude: { not: null },
        dropoffLatitude: { not: null },
        dropoffLongitude: { not: null },
        itemTitle: { not: null },
        itemType: { not: null },
        OR: [{ isImmediate: true }, { scheduledPickupAt: { not: null } }],
      },
      select: DRIVER_REQUEST_DETAILS_SELECT,
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });

    const vehicles = await this.getApprovedDriverVehicles(profile.id);
    const alerts: DriverRequestAlertSummaryDto[] = [];

    for (const request of requests as RequestDetailsSource[]) {
      const existingAlert = request.driverAlerts.find(
        (alert) => alert.driverId === profile.id,
      );
      if (
        existingAlert &&
        (existingAlert.status === DriverRequestAlertStatus.IGNORED ||
          existingAlert.status === DriverRequestAlertStatus.ACCEPTED ||
          existingAlert.status === DriverRequestAlertStatus.EXPIRED)
      ) {
        continue;
      }

      if (
        !request.service ||
        !this.hasCompatibleDriverVehicleForRequest(request, vehicles)
      ) {
        continue;
      }

      const distanceKm = this.calculateDistanceKm(
        availability.baseLatitude,
        availability.baseLongitude,
        request.pickupLatitude,
        request.pickupLongitude,
      );
      if (
        distanceKm !== null &&
        availability.serviceRadiusKm > 0 &&
        distanceKm > availability.serviceRadiusKm
      ) {
        continue;
      }

      const alert = await this.ensureDriverRequestAlert({
        requestId: request.id,
        driverId: profile.id,
      });

      alerts.push(this.toRequestAlertSummary(request, alert, distanceKm));
    }

    return { alerts };
  }

  async getDriverRequestDetails(
    input: GetDriverRequestDetailsInput,
  ): Promise<DriverRequestDetailsResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    this.ensureDriverOnboardingForAlerts(profile);

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: DRIVER_REQUEST_DETAILS_SELECT,
    });

    if (!request) {
      throw new NotFoundException('Request not found.');
    }

    const offer = await this.prisma.driverOffer.findUnique({
      where: {
        requestId_driverId: {
          requestId: request.id,
          driverId: profile.id,
        },
      },
      select: {
        status: true,
      },
    });

    const existingAlert =
      request.driverAlerts.find((alert) => alert.driverId === profile.id) ?? null;
    const isSelectedDriver = request.assignedDriverId === profile.id;
    const hasOfferAccess = Boolean(offer);
    const hasAlertAccess =
      existingAlert !== null &&
      existingAlert.status !== DriverRequestAlertStatus.IGNORED &&
      existingAlert.status !== DriverRequestAlertStatus.EXPIRED;

    if (!hasAlertAccess && !hasOfferAccess && !isSelectedDriver) {
      throw new NotFoundException('Request not available for this driver.');
    }

    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId: profile.id },
      select: {
        baseLatitude: true,
        baseLongitude: true,
        serviceRadiusKm: true,
      },
    });

    const distanceKm = availability
      ? this.calculateDistanceKm(
          availability.baseLatitude,
          availability.baseLongitude,
          request.pickupLatitude,
          request.pickupLongitude,
        )
      : null;

    let alert = existingAlert;
    if (!alert && (hasOfferAccess || isSelectedDriver)) {
      alert = await this.ensureDriverRequestAlert({
        requestId: request.id,
        driverId: profile.id,
      });
    }

    if (!alert) {
      throw new NotFoundException('Request not available for this driver.');
    }

    const seenAlert =
      alert.status === DriverRequestAlertStatus.NEW
        ? await this.prisma.driverRequestAlert.update({
            where: { id: alert.id },
            data: { status: DriverRequestAlertStatus.SEEN, seenAt: new Date() },
            select: DRIVER_REQUEST_ALERT_SELECT,
          })
        : alert;

    return this.toRequestDetailsResponse(
      request,
      seenAlert,
      distanceKm,
      offer?.status ?? null,
    );
  }

  async markDriverRequestSeen(
    input: UpdateDriverRequestAlertInput,
  ): Promise<DriverRequestAlertActionResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true, status: true },
    });
    if (!request) throw new NotFoundException('Request not found.');

    const alert = await this.ensureDriverRequestAlert({
      requestId: request.id,
      driverId: profile.id,
    });

    if (alert.status === DriverRequestAlertStatus.NEW) {
      const updated = await this.prisma.driverRequestAlert.update({
        where: { id: alert.id },
        data: { status: DriverRequestAlertStatus.SEEN, seenAt: new Date() },
        select: DRIVER_REQUEST_ALERT_SELECT,
      });
      return {
        alertId: updated.id,
        requestId: updated.requestId,
        alertStatus: updated.status,
      };
    }

    return {
      alertId: alert.id,
      requestId: alert.requestId,
      alertStatus: alert.status,
    };
  }

  async acceptDriverRequestAlert(
    input: UpdateDriverRequestAlertInput,
  ): Promise<DriverRequestAlertActionResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    this.ensureDriverOnboardingForAlerts(profile);

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true, status: true },
    });
    if (!request) throw new NotFoundException('Request not found.');
    if (request.status !== TransportRequestStatus.PENDING_QUOTES) {
      throw new BadRequestException(
        'Request is no longer available for quotes.',
      );
    }

    const alert = await this.ensureDriverRequestAlert({
      requestId: request.id,
      driverId: profile.id,
    });

    if (
      alert.status === DriverRequestAlertStatus.IGNORED ||
      alert.status === DriverRequestAlertStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Cannot accept ignored or expired request alert.',
      );
    }

    if (alert.status === DriverRequestAlertStatus.ACCEPTED) {
      return {
        alertId: alert.id,
        requestId: alert.requestId,
        alertStatus: alert.status,
        nextStep: 'SEND_PRICE_OFFER',
      };
    }

    const updated = await this.prisma.driverRequestAlert.update({
      where: { id: alert.id },
      data: {
        status: DriverRequestAlertStatus.ACCEPTED,
        acceptedAt: new Date(),
        seenAt: alert.seenAt ?? new Date(),
      },
      select: DRIVER_REQUEST_ALERT_SELECT,
    });

    return {
      alertId: updated.id,
      requestId: updated.requestId,
      alertStatus: updated.status,
      nextStep: 'SEND_PRICE_OFFER',
    };
  }

  async ignoreDriverRequestAlert(
    input: UpdateDriverRequestAlertInput,
  ): Promise<DriverRequestAlertActionResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    this.ensureDriverOnboardingForAlerts(profile);

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true, status: true },
    });
    if (!request) throw new NotFoundException('Request not found.');
    if (request.status !== TransportRequestStatus.PENDING_QUOTES) {
      throw new BadRequestException(
        'Request is no longer available for quotes.',
      );
    }

    const alert = await this.ensureDriverRequestAlert({
      requestId: request.id,
      driverId: profile.id,
    });

    if (alert.status === DriverRequestAlertStatus.IGNORED) {
      return {
        alertId: alert.id,
        requestId: alert.requestId,
        alertStatus: alert.status,
      };
    }

    const updated = await this.prisma.driverRequestAlert.update({
      where: { id: alert.id },
      data: {
        status: DriverRequestAlertStatus.IGNORED,
        ignoredAt: new Date(),
        seenAt: alert.seenAt ?? new Date(),
      },
      select: DRIVER_REQUEST_ALERT_SELECT,
    });

    return {
      alertId: updated.id,
      requestId: updated.requestId,
      alertStatus: updated.status,
    };
  }

  async sendDriverPriceOffer(
    input: SendDriverPriceOfferInput,
  ): Promise<SendDriverPriceOfferResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    this.ensureDriverOnboardingForAlerts(profile);

    this.validateOfferInput(input);
    const normalizedCurrency = input.currency.trim().toUpperCase();
    if (!SUPPORTED_OFFER_CURRENCIES.has(normalizedCurrency)) {
      // TODO: validate against request country currency when country/currency mapping is introduced.
      throw new BadRequestException(
        `currency must be one of: ${Array.from(SUPPORTED_OFFER_CURRENCIES).join(', ')}.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.transportRequest.findUnique({
        where: { id: input.requestId },
        select: DRIVER_REQUEST_DETAILS_SELECT,
      });

      if (!request) {
        throw new NotFoundException('Request not found.');
      }

      if (
        request.status !== TransportRequestStatus.PENDING_QUOTES &&
        request.status !== TransportRequestStatus.QUOTED
      ) {
        throw new BadRequestException(
          'Request is no longer available for offers.',
        );
      }

      if (
        request.pickupLatitude === null ||
        request.pickupLongitude === null ||
        request.dropoffLatitude === null ||
        request.dropoffLongitude === null ||
        !request.itemTitle ||
        request.itemType === null ||
        (!request.isImmediate && !request.scheduledPickupAt)
      ) {
        throw new BadRequestException(
          'Request is incomplete and cannot receive offers.',
        );
      }

      const existingAlert = request.driverAlerts.find(
        (alert) => alert.driverId === profile.id,
      );
      if (!existingAlert) {
        throw new BadRequestException(
          'Accept the request alert before sending an offer.',
        );
      }

      if (
        existingAlert.status === DriverRequestAlertStatus.IGNORED ||
        existingAlert.status === DriverRequestAlertStatus.EXPIRED
      ) {
        throw new BadRequestException(
          'Cannot send offer for ignored or expired request alert.',
        );
      }

      if (existingAlert.status !== DriverRequestAlertStatus.ACCEPTED) {
        throw new BadRequestException(
          'Accept the request alert before sending an offer.',
        );
      }

      const vehicles = await this.getApprovedDriverVehiclesTx(tx, profile.id);
      if (
        !request.service ||
        !this.hasCompatibleDriverVehicleForRequest(request, vehicles)
      ) {
        throw new BadRequestException(
          'Request is not available for this driver.',
        );
      }

      const availability = await tx.driverAvailability.findUnique({
        where: { driverId: profile.id },
        select: {
          baseLatitude: true,
          baseLongitude: true,
          serviceRadiusKm: true,
        },
      });

      if (!availability) {
        throw new BadRequestException(
          'Driver availability must be configured first.',
        );
      }

      const distanceKm = this.calculateDistanceKm(
        availability.baseLatitude,
        availability.baseLongitude,
        request.pickupLatitude,
        request.pickupLongitude,
      );
      if (
        distanceKm !== null &&
        availability.serviceRadiusKm > 0 &&
        distanceKm > availability.serviceRadiusKm
      ) {
        throw new BadRequestException(
          'Request is outside your service radius.',
        );
      }

      const duplicateOffer = await tx.driverOffer.findUnique({
        where: {
          requestId_driverId: {
            requestId: request.id,
            driverId: profile.id,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (
        duplicateOffer &&
        duplicateOffer.status !== DriverOfferStatus.CANCELLED &&
        duplicateOffer.status !== DriverOfferStatus.REJECTED &&
        duplicateOffer.status !== DriverOfferStatus.EXPIRED
      ) {
        throw new ConflictException(
          'An active offer for this request already exists.',
        );
      }

      if (duplicateOffer) {
        throw new ConflictException(
          'An offer already exists for this request and driver.',
        );
      }

      const createdOffer = await tx.driverOffer.create({
        data: {
          requestId: request.id,
          driverId: profile.id,
          alertId: existingAlert.id,
          price: new Prisma.Decimal(input.price),
          currency: normalizedCurrency,
          estimatedPickupAt: input.estimatedPickupAt ?? null,
          estimatedDeliveryAt: input.estimatedDeliveryAt ?? null,
          estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
          message: input.message?.trim() || null,
          status: DriverOfferStatus.PENDING,
        },
        select: DRIVER_OFFER_SELECT,
      });

      const updatedRequest =
        request.status === TransportRequestStatus.PENDING_QUOTES
          ? await tx.transportRequest.update({
              where: { id: request.id },
              data: { status: TransportRequestStatus.QUOTED },
              select: {
                id: true,
                status: true,
              },
            })
          : {
              id: request.id,
              status: request.status,
            };

      return {
        createdOffer,
        updatedRequest,
        customerId: request.customerId,
        driverId: profile.id,
      };
    });

    const customerOffer = await this.prisma.driverOffer.findUnique({
      where: { id: result.createdOffer.id },
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

    if (customerOffer) {
      const estimatedPickupAt = customerOffer.estimatedPickupAt
        ? customerOffer.estimatedPickupAt.toISOString()
        : null;
      const driverName =
        `${customerOffer.driver.firstName} ${customerOffer.driver.lastName}`.trim();
      const payload: OfferNewPayload = {
        requestId: result.updatedRequest.id,
        requestStatus: result.updatedRequest.status,
        offer: {
          id: customerOffer.id,
          offerId: customerOffer.id,
          requestId: customerOffer.requestId,
          driverId: customerOffer.driverId,
          driverName: driverName || null,
          driverVehiclePhoto:
            customerOffer.driver.vehicles[0]?.documents[0]?.url ??
            customerOffer.driver.profilePhotoUrl ??
            null,
          driverRating:
            customerOffer.driver.averageRating !== null
              ? Number(customerOffer.driver.averageRating)
              : null,
          price: Number(customerOffer.price),
          proposedPrice: Number(customerOffer.price),
          currency: customerOffer.currency,
          estimatedPickupAt,
          estimatedArrivalTime: estimatedPickupAt,
          estimatedDeliveryAt: customerOffer.estimatedDeliveryAt
            ? customerOffer.estimatedDeliveryAt.toISOString()
            : null,
          estimatedDurationMinutes: customerOffer.estimatedDurationMinutes,
          message: customerOffer.message,
          status: customerOffer.status,
          offerStatus: customerOffer.status,
          createdAt: customerOffer.createdAt.toISOString(),
          acceptedAt: customerOffer.acceptedAt
            ? customerOffer.acceptedAt.toISOString()
            : null,
        },
      };
      this.tripsGateway.emitOfferNew(result.customerId, payload);

      void this.notificationsService
        .notifyCustomerAboutDriverOffer({
          customerId: result.customerId,
          requestId: result.updatedRequest.id,
          offerId: customerOffer.id,
          driverName: driverName || undefined,
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Failed to notify customer about offer ${customerOffer.id}: ${error instanceof Error ? error.message : 'Unexpected error'}`,
          );
        });
    }
    if (!customerOffer) {
      void this.notificationsService
        .notifyCustomerAboutDriverOffer({
          customerId: result.customerId,
          requestId: result.updatedRequest.id,
          offerId: result.createdOffer.id,
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Failed to notify customer about offer ${result.createdOffer.id}: ${error instanceof Error ? error.message : 'Unexpected error'}`,
          );
        });
    }

    return {
      offer: this.toDriverOfferResponse(result.createdOffer),
      request: {
        id: result.updatedRequest.id,
        status: result.updatedRequest.status,
      },
      nextStep: 'WAIT_FOR_CUSTOMER_RESPONSE',
    };
  }

  async listMyVehicles(
    input: ListDriverVehiclesInput,
  ): Promise<DriverVehiclesListResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);

    const vehicles = await this.prisma.driverVehicle.findMany({
      where: { driverId: profile.id },
      orderBy: { createdAt: 'desc' },
      select: {
        ...DRIVER_VEHICLE_SELECT,
        documents: {
          orderBy: { createdAt: 'asc' },
          select: DRIVER_DOCUMENT_SELECT,
        },
      },
    });

    return {
      driverStatus: profile.status,
      nextStep: this.getVehicleDocumentsNextStep(profile.status, vehicles),
      vehicles: vehicles.map((vehicle) => ({
        vehicle: this.toVehicleResponse(vehicle, vehicle.documents),
        documents: vehicle.documents.map((document) =>
          this.toDocumentResponse(document),
        ),
      })),
    };
  }

  async getVehicle(
    input: GetDriverVehicleInput,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const vehicle = await this.getDriverVehicleWithDocuments(
      profile.id,
      input.vehicleId,
    );

    return {
      vehicle: this.toVehicleResponse(vehicle, vehicle.documents),
      documents: vehicle.documents.map((document) =>
        this.toDocumentResponse(document),
      ),
      nextStep: await this.getVehicleDocumentsNextStepForDriver(
        profile.id,
        profile.status,
      ),
    };
  }

  async upsertVehicleLoadCapacity(
    input: UpsertDriverVehicleLoadCapacityInput,
  ): Promise<DriverVehicleLoadCapacityResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const vehicle = await this.getDriverVehicleWithDocuments(
      profile.id,
      input.vehicleId,
    );

    const normalizedVehicleType = normalizeDriverVehicleTypeInput(
      vehicle.vehicleType,
    ) as VehicleType;
    const normalizedWorkingSchedule = this.validateLoadCapacitySchedule(
      input.workingSchedule,
    );
    const normalizedPayload = this.normalizeVehicleLoadCapacityInput({
      vehicleType: normalizedVehicleType,
      name: input.name,
      maxLoadKg: input.maxLoadKg,
      cargoLengthM: input.cargoLengthM,
      cargoWidthM: input.cargoWidthM,
      cargoHeightM: input.cargoHeightM,
      dimensionsAreStandard: input.dimensionsAreStandard,
      allowedCargoTypes: input.allowedCargoTypes,
      workingSchedule: normalizedWorkingSchedule,
      isDefault: input.isDefault,
    });

    const updatedVehicle = await this.prisma.$transaction(async (tx) => {
      if (normalizedPayload.isDefault) {
        await tx.driverVehicle.updateMany({
          where: {
            driverId: profile.id,
            isDefaultLoadProfile: true,
            NOT: { id: vehicle.id },
          },
          data: {
            isDefaultLoadProfile: false,
          },
        });
      }

      return tx.driverVehicle.update({
        where: { id: vehicle.id },
        data: {
          loadProfileName: normalizedPayload.name,
          capacityKg: normalizedPayload.maxLoadKg,
          lengthCm: normalizedPayload.lengthCm,
          widthCm: normalizedPayload.widthCm,
          heightCm: normalizedPayload.heightCm,
          dimensionsAreStandard: normalizedPayload.dimensionsAreStandard,
          allowedCargoTypes: normalizedPayload.allowedCargoTypes,
          workingSchedule:
            normalizedPayload.workingSchedule as unknown as Prisma.InputJsonValue,
          isDefaultLoadProfile: normalizedPayload.isDefault,
        },
        select: DRIVER_VEHICLE_SELECT,
      });
    });

    await this.syncOpenRequestAlertsForDriver(profile.id);

    return this.toVehicleLoadCapacityResponse(updatedVehicle);
  }

  async getVehicleLoadCapacity(
    input: GetDriverVehicleInput,
  ): Promise<DriverVehicleLoadCapacityResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const vehicle = await this.getDriverVehicleWithDocuments(
      profile.id,
      input.vehicleId,
    );
    return this.toVehicleLoadCapacityResponse(vehicle);
  }

  async listVehicleLoadCapacities(
    input: ListDriverVehiclesInput,
  ): Promise<DriverVehicleLoadCapacitiesListResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const vehicles = await this.prisma.driverVehicle.findMany({
      where: {
        driverId: profile.id,
      },
      orderBy: [{ isDefaultLoadProfile: 'desc' }, { createdAt: 'asc' }],
      select: DRIVER_VEHICLE_SELECT,
    });

    return {
      loadCapacities: vehicles.map((vehicle) =>
        this.toVehicleLoadCapacityResponse(vehicle),
      ),
    };
  }

  async setDefaultVehicleLoadCapacity(
    input: GetDriverVehicleInput,
  ): Promise<DriverVehicleLoadCapacityResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const vehicle = await this.getDriverVehicleWithDocuments(
      profile.id,
      input.vehicleId,
    );

    const updatedVehicle = await this.prisma.$transaction(async (tx) => {
      await tx.driverVehicle.updateMany({
        where: {
          driverId: profile.id,
          isDefaultLoadProfile: true,
        },
        data: {
          isDefaultLoadProfile: false,
        },
      });

      return tx.driverVehicle.update({
        where: { id: vehicle.id },
        data: {
          isDefaultLoadProfile: true,
        },
        select: DRIVER_VEHICLE_SELECT,
      });
    });

    await this.syncOpenRequestAlertsForDriver(profile.id);

    return this.toVehicleLoadCapacityResponse(updatedVehicle);
  }

  async getDriverEarningsSummary(
    input: DriverEarningsSummaryInput,
  ): Promise<DriverEarningsSummaryResponse> {
    const profile = await this.validateDriverCanViewEarnings(input.driverId);
    const dateRange = this.validateDateRange(input.from, input.to);

    const where: Prisma.DriverEarningWhereInput = {
      driverId: profile.id,
      ...(dateRange
        ? { createdAt: { gte: dateRange.from, lte: dateRange.to } }
        : {}),
    };

    const [
      earningsAgg,
      byStatusAgg,
      completedTripsCount,
      ratingsAgg,
      profileSummary,
    ] = await Promise.all([
      this.prisma.driverEarning.aggregate({
        where,
        _sum: {
          grossAmount: true,
          platformFeeAmount: true,
          netAmount: true,
        },
      }),
      this.prisma.driverEarning.groupBy({
        by: ['status'],
        where,
        _sum: { netAmount: true },
      }),
      this.prisma.transportRequest.count({
        where: {
          assignedDriverId: profile.id,
          status: {
            in: [
              TransportRequestStatus.DELIVERED,
              TransportRequestStatus.COMPLETED,
            ],
          },
          ...(dateRange
            ? { deliveredAt: { gte: dateRange.from, lte: dateRange.to } }
            : {}),
        },
      }),
      this.prisma.driverRating.aggregate({
        where: { driverId: profile.id },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.driverProfile.findUnique({
        where: { id: profile.id },
        select: { averageRating: true, ratingsCount: true },
      }),
    ]);

    const currency = await this.resolveDriverCurrency(profile.id);
    const statusMap = new Map<DriverEarningStatus, Prisma.Decimal>();
    byStatusAgg.forEach((row) => {
      statusMap.set(row.status, row._sum.netAmount ?? new Prisma.Decimal(0));
    });

    const averageRating =
      profileSummary?.averageRating !== null &&
      profileSummary?.averageRating !== undefined
        ? Number(profileSummary.averageRating)
        : (ratingsAgg._avg.rating ?? null);

    const ratingsCount = profileSummary?.ratingsCount ?? ratingsAgg._count._all;

    return this.mapDriverEarningsSummaryResponse({
      currency,
      totalGross: earningsAgg._sum.grossAmount ?? new Prisma.Decimal(0),
      totalPlatformFees:
        earningsAgg._sum.platformFeeAmount ?? new Prisma.Decimal(0),
      totalNet: earningsAgg._sum.netAmount ?? new Prisma.Decimal(0),
      pendingAmount:
        statusMap.get(DriverEarningStatus.PENDING) ?? new Prisma.Decimal(0),
      availableAmount:
        statusMap.get(DriverEarningStatus.AVAILABLE) ?? new Prisma.Decimal(0),
      paidOutAmount:
        statusMap.get(DriverEarningStatus.PAID_OUT) ?? new Prisma.Decimal(0),
      completedTripsCount,
      averageRating,
      ratingsCount,
    });
  }

  async getDriverEarnings(
    input: DriverEarningsListInput,
  ): Promise<PaginatedResponse<DriverEarningItemResponse>> {
    const profile = await this.validateDriverCanViewEarnings(input.driverId);
    const dateRange = this.validateDateRange(input.from, input.to);
    const page = this.normalizePage(input.page);
    const limit = this.normalizeLimit(input.limit);

    const where: Prisma.DriverEarningWhereInput = {
      driverId: profile.id,
      ...(input.status ? { status: input.status } : {}),
      ...(dateRange
        ? { createdAt: { gte: dateRange.from, lte: dateRange.to } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.driverEarning.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          tripId: true,
          grossAmount: true,
          platformFeeAmount: true,
          netAmount: true,
          currency: true,
          status: true,
          createdAt: true,
          availableAt: true,
          paidOutAt: true,
        },
      }),
      this.prisma.driverEarning.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapDriverEarningItemResponse(item)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getDriverRatings(
    input: DriverRatingsListInput,
  ): Promise<PaginatedResponse<DriverRatingItemResponse>> {
    const profile = await this.validateDriverCanViewEarnings(input.driverId);
    const page = this.normalizePage(input.page);
    const limit = this.normalizeLimit(input.limit);

    if (
      input.rating !== undefined &&
      (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
    ) {
      throw new BadRequestException(
        'rating must be an integer between 1 and 5.',
      );
    }

    const where: Prisma.DriverRatingWhereInput = {
      driverId: profile.id,
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.driverRating.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          tripId: true,
          rating: true,
          comment: true,
          createdAt: true,
          customer: {
            select: {
              name: true,
            },
          },
        },
      }),
      this.prisma.driverRating.count({ where }),
    ]);

    return {
      items: items.map((item) =>
        this.mapDriverRatingItemResponse(item as DriverRatingSource),
      ),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getDriverAcceptedJobs(
    input: GetDriverAcceptedJobsInput,
  ): Promise<DriverAcceptedJobSummaryDto[]> {
    const profile = await this.ensureDriverProfile(input.userId);

    const requests = await this.prisma.transportRequest.findMany({
      where: {
        assignedDriverId: profile.id,
        status: { in: ACCEPTED_JOB_REQUEST_STATUSES },
      },
      orderBy: { acceptedAt: 'desc' },
      select: {
        id: true,
        status: true,
        acceptedAt: true,
        pickupLatitude: true,
        pickupLongitude: true,
        pickupAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        dropoffAddress: true,
        isImmediate: true,
        scheduledPickupAt: true,
        itemTitle: true,
        itemType: true,
        itemDescription: true,
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
        vehicleCondition: true,
        vehicleConditionNotes: true,
        itemCondition: true,
        itemWeightKg: true,
        itemLengthCm: true,
        itemWidthCm: true,
        itemHeightCm: true,
        requiresLoadingHelp: true,
        loadingWorkersCount: true,
        specialInstructions: true,
        service: {
          select: {
            id: true,
            key: true,
            nameEn: true,
            nameAr: true,
            icon: true,
          },
        },
        customer: {
          select: {
            name: true,
          },
        },
        photos: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            url: true,
            mimeType: true,
            sizeBytes: true,
            sortOrder: true,
            createdAt: true,
          },
        },
        acceptedOffer: {
          select: DRIVER_OFFER_SELECT,
        },
      },
    });

    return (requests as AcceptedJobRequestSource[])
      .filter((request) => request.acceptedOffer !== null)
      .map((request) => this.toAcceptedJobSummaryResponse(request));
  }

  async getDriverAcceptedJobDetails(
    input: GetDriverAcceptedJobDetailsInput,
  ): Promise<DriverAcceptedJobDetailsResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        status: true,
        acceptedAt: true,
        assignedDriverId: true,
        pickupLatitude: true,
        pickupLongitude: true,
        pickupAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        dropoffAddress: true,
        isImmediate: true,
        scheduledPickupAt: true,
        itemTitle: true,
        itemType: true,
        itemDescription: true,
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
        vehicleCondition: true,
        vehicleConditionNotes: true,
        itemCondition: true,
        itemWeightKg: true,
        itemLengthCm: true,
        itemWidthCm: true,
        itemHeightCm: true,
        requiresLoadingHelp: true,
        loadingWorkersCount: true,
        specialInstructions: true,
        service: {
          select: {
            id: true,
            key: true,
            nameEn: true,
            nameAr: true,
            icon: true,
          },
        },
        customer: {
          select: {
            name: true,
          },
        },
        photos: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            url: true,
            mimeType: true,
            sizeBytes: true,
            sortOrder: true,
            createdAt: true,
          },
        },
        acceptedOffer: {
          select: DRIVER_OFFER_SELECT,
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found.');
    }

    if (request.assignedDriverId !== profile.id) {
      throw new NotFoundException('Accepted job not found.');
    }

    if (
      request.status !== TransportRequestStatus.ACCEPTED &&
      request.status !== TransportRequestStatus.DRIVER_ASSIGNED &&
      request.status !== TransportRequestStatus.DRIVER_GOING_TO_PICKUP &&
      request.status !== TransportRequestStatus.DRIVER_ARRIVED_PICKUP &&
      request.status !== TransportRequestStatus.DRIVER_GOING_TO_DROPOFF
    ) {
      throw new BadRequestException('Request is not in accepted job state.');
    }

    if (!request.acceptedOffer) {
      throw new BadRequestException(
        'Accepted offer is missing for this request.',
      );
    }

    return this.toAcceptedJobDetailsResponse(request);
  }

  async createVehicle(
    input: CreateDriverVehicleInput,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const normalizedVehicleType = normalizeDriverVehicleTypeInput(
      input.vehicleType,
    ) as VehicleType;

    if (!profile.isProfileCompleted) {
      throw new BadRequestException(
        'Driver profile must be completed before adding vehicles.',
      );
    }

    const currentYear = new Date().getFullYear();
    if (input.year < 1980 || input.year > currentYear + 1) {
      throw new BadRequestException(
        `year must be between 1980 and ${currentYear + 1}.`,
      );
    }

    if (input.insuranceExpiryDate) {
      this.assertExpiryDateNotPast(
        input.insuranceExpiryDate,
        'Insurance expiry date',
      );
    }

    if (input.registrationExpiryDate) {
      this.assertExpiryDateNotPast(
        input.registrationExpiryDate,
        'Registration expiry date',
      );
    }

    const plateNumber = input.licensePlateNumber.trim();

    const existingVehicle = await this.prisma.driverVehicle.findUnique({
      where: { plateNumber },
      select: { id: true },
    });

    if (existingVehicle) {
      throw new ConflictException('plateNumber is already in use.');
    }

    const vehicle = await this.prisma.driverVehicle.create({
      data: {
        driverId: profile.id,
        vehicleType: normalizedVehicleType,
        make: input.brand.trim(),
        model: input.model.trim(),
        year: input.year,
        plateNumber,
        condition: input.condition,
        color: input.color?.trim() || null,
        capacityKg: input.capacityKg ?? null,
        lengthCm: input.lengthCm ?? null,
        widthCm: input.widthCm ?? null,
        heightCm: input.heightCm ?? null,
        hasTrailer: input.hasTrailer,
        insuranceExpiryDate: input.insuranceExpiryDate ?? null,
        registrationExpiryDate: input.registrationExpiryDate ?? null,
        status: DriverVehicleReviewStatus.PENDING_REVIEW,
        isActive: false,
      },
      select: DRIVER_VEHICLE_SELECT,
    });

    return {
      vehicle: this.toVehicleResponse(vehicle, []),
      documents: [],
      nextStep: 'ADD_VEHICLE_DOCUMENTS',
    };
  }

  async updateVehicle(
    input: UpdateDriverVehicleInput,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const existingVehicle = await this.getDriverVehicleWithDocuments(
      profile.id,
      input.vehicleId,
    );
    const normalizedVehicleType =
      input.vehicleType !== undefined
        ? (normalizeDriverVehicleTypeInput(input.vehicleType) as VehicleType)
        : undefined;

    if (input.year !== undefined) {
      const currentYear = new Date().getFullYear();
      if (input.year < 1980 || input.year > currentYear + 1) {
        throw new BadRequestException(
          `year must be between 1980 and ${currentYear + 1}.`,
        );
      }
    }

    if (input.insuranceExpiryDate) {
      this.assertExpiryDateNotPast(
        input.insuranceExpiryDate,
        'Insurance expiry date',
      );
    }

    if (input.registrationExpiryDate) {
      this.assertExpiryDateNotPast(
        input.registrationExpiryDate,
        'Registration expiry date',
      );
    }

    const normalizedPlateNumber =
      input.licensePlateNumber !== undefined
        ? input.licensePlateNumber.trim()
        : existingVehicle.plateNumber;

    if (normalizedPlateNumber !== existingVehicle.plateNumber) {
      const duplicateVehicle = await this.prisma.driverVehicle.findUnique({
        where: { plateNumber: normalizedPlateNumber },
        select: { id: true },
      });

      if (duplicateVehicle && duplicateVehicle.id !== existingVehicle.id) {
        throw new ConflictException('plateNumber is already in use.');
      }
    }

    const shouldResetVehicleReview =
      input.vehicleType !== undefined ||
      input.brand !== undefined ||
      input.model !== undefined ||
      input.year !== undefined ||
      input.licensePlateNumber !== undefined ||
      input.condition !== undefined ||
      input.color !== undefined ||
      input.capacityKg !== undefined ||
      input.lengthCm !== undefined ||
      input.widthCm !== undefined ||
      input.heightCm !== undefined ||
      input.hasTrailer !== undefined ||
      input.insuranceExpiryDate !== undefined ||
      input.registrationExpiryDate !== undefined;

    const vehicle = await this.prisma.driverVehicle.update({
      where: { id: existingVehicle.id },
      data: {
        vehicleType: normalizedVehicleType ?? existingVehicle.vehicleType,
        make:
          input.brand !== undefined ? input.brand.trim() : existingVehicle.make,
        model:
          input.model !== undefined
            ? input.model.trim()
            : existingVehicle.model,
        year: input.year ?? existingVehicle.year,
        plateNumber: normalizedPlateNumber,
        condition: input.condition ?? existingVehicle.condition,
        color:
          input.color !== undefined
            ? input.color?.trim() || null
            : existingVehicle.color,
        capacityKg:
          input.capacityKg !== undefined
            ? input.capacityKg
            : existingVehicle.capacityKg,
        lengthCm:
          input.lengthCm !== undefined
            ? input.lengthCm
            : existingVehicle.lengthCm,
        widthCm:
          input.widthCm !== undefined ? input.widthCm : existingVehicle.widthCm,
        heightCm:
          input.heightCm !== undefined
            ? input.heightCm
            : existingVehicle.heightCm,
        hasTrailer:
          input.hasTrailer !== undefined
            ? input.hasTrailer
            : existingVehicle.hasTrailer,
        insuranceExpiryDate:
          input.insuranceExpiryDate !== undefined
            ? input.insuranceExpiryDate
            : existingVehicle.insuranceExpiryDate,
        registrationExpiryDate:
          input.registrationExpiryDate !== undefined
            ? input.registrationExpiryDate
            : existingVehicle.registrationExpiryDate,
        status: shouldResetVehicleReview
          ? DriverVehicleReviewStatus.PENDING_REVIEW
          : existingVehicle.status,
        isActive: shouldResetVehicleReview ? false : existingVehicle.isActive,
        rejectionReason: shouldResetVehicleReview
          ? null
          : existingVehicle.rejectionReason,
      },
      select: {
        ...DRIVER_VEHICLE_SELECT,
        documents: {
          orderBy: { createdAt: 'asc' },
          select: DRIVER_DOCUMENT_SELECT,
        },
      },
    });

    return {
      vehicle: this.toVehicleResponse(vehicle, vehicle.documents),
      documents: vehicle.documents.map((document) =>
        this.toDocumentResponse(document),
      ),
      nextStep: await this.getVehicleDocumentsNextStepForDriver(
        profile.id,
        profile.status,
      ),
    };
  }

  async deactivateVehicle(
    input: DeactivateDriverVehicleInput,
  ): Promise<VehicleResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const vehicle = await this.getDriverVehicleWithDocuments(
      profile.id,
      input.vehicleId,
    );

    if (vehicle.status === DriverVehicleReviewStatus.PENDING_REVIEW) {
      await this.prisma.driverVehicle.delete({
        where: { id: vehicle.id },
      });

      return this.toVehicleResponse(vehicle, vehicle.documents);
    }

    const updatedVehicle = await this.prisma.driverVehicle.update({
      where: { id: vehicle.id },
      data: {
        isActive: false,
        status: DriverVehicleReviewStatus.INACTIVE,
      },
      select: {
        ...DRIVER_VEHICLE_SELECT,
        documents: {
          orderBy: { createdAt: 'asc' },
          select: DRIVER_DOCUMENT_SELECT,
        },
      },
    });

    return this.toVehicleResponse(updatedVehicle, updatedVehicle.documents);
  }

  async activateVehicle(
    input: DeactivateDriverVehicleInput,
  ): Promise<VehicleResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);
    const vehicle = await this.getDriverVehicleWithDocuments(
      profile.id,
      input.vehicleId,
    );

    if (
      !this.hasRequiredVehicleDocuments(vehicle.documents) ||
      !this.hasVehicleLoadCapacityProfile(vehicle)
    ) {
      throw new BadRequestException(
        'Vehicle load profile and required documents must be completed before activation.',
      );
    }

    const updatedVehicle = await this.prisma.driverVehicle.update({
      where: { id: vehicle.id },
      data: {
        isActive: true,
        status: DriverVehicleReviewStatus.APPROVED,
        rejectionReason: null,
      },
      select: {
        ...DRIVER_VEHICLE_SELECT,
        documents: {
          orderBy: { createdAt: 'asc' },
          select: DRIVER_DOCUMENT_SELECT,
        },
      },
    });

    return this.toVehicleResponse(updatedVehicle, updatedVehicle.documents);
  }

  async approveVehicleForTesting(
    input: DeactivateDriverVehicleInput,
  ): Promise<VehicleResponseDto> {
    const allowInProduction = process.env.ALLOW_TESTING_APPROVAL === 'true';
    if (process.env.NODE_ENV === 'production' && !allowInProduction) {
      throw new BadRequestException(
        'Testing approval is disabled in production.',
      );
    }

    const profile = await this.ensureDriverProfile(input.userId);
    const vehicle = await this.getDriverVehicleWithDocuments(
      profile.id,
      input.vehicleId,
    );

    const updatedVehicle = await this.prisma.driverVehicle.update({
      where: { id: vehicle.id },
      data: {
        isActive: true,
        status: DriverVehicleReviewStatus.APPROVED,
        rejectionReason: null,
      },
      select: {
        ...DRIVER_VEHICLE_SELECT,
        documents: {
          orderBy: { createdAt: 'asc' },
          select: DRIVER_DOCUMENT_SELECT,
        },
      },
    });

    return this.toVehicleResponse(updatedVehicle, updatedVehicle.documents);
  }

  async uploadVehicleDocuments(
    input: UploadDriverVehicleDocumentsInput,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);

    if (!profile.isProfileCompleted) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw new BadRequestException(
        'Driver profile must be completed before uploading documents.',
      );
    }

    const vehicle = await this.prisma.driverVehicle.findFirst({
      where: {
        id: input.vehicleId,
        driverId: profile.id,
      },
      select: {
        ...DRIVER_VEHICLE_SELECT,
        documents: {
          orderBy: { createdAt: 'asc' },
          select: DRIVER_DOCUMENT_SELECT,
        },
      },
    });

    if (!vehicle) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw new NotFoundException('Vehicle not found.');
    }

    if (input.insuranceExpiryDate) {
      this.assertExpiryDateNotPast(
        input.insuranceExpiryDate,
        'Insurance expiry date',
      );
    }

    if (input.registrationExpiryDate) {
      this.assertExpiryDateNotPast(
        input.registrationExpiryDate,
        'Registration expiry date',
      );
    }

    const driverFiles = input.files;

    const documentRows = this.buildDocumentRows(
      profile.id,
      vehicle.id,
      driverFiles,
    );
    if (documentRows.length === 0) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw new BadRequestException(
        'At least one vehicle document or photo is required.',
      );
    }

    const requiredMissing = this.getMissingCanonicalVehicleUploads(
      driverFiles,
      vehicle,
    );
    if (requiredMissing.length > 0) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw new BadRequestException(
        `Missing required vehicle files: ${requiredMissing.join(', ')}.`,
      );
    }

    const replaceableTypes = [...new Set(documentRows.map((row) => row.type))];
    const existingDocuments =
      replaceableTypes.length > 0
        ? await this.prisma.driverDocument.findMany({
            where: {
              driverId: profile.id,
              vehicleId: vehicle.id,
              type: { in: replaceableTypes },
            },
            select: {
              id: true,
              storageKey: true,
            },
          })
        : [];

    try {
      await this.prisma.$transaction(async (tx) => {
        if (existingDocuments.length > 0) {
          await tx.driverDocument.deleteMany({
            where: {
              id: { in: existingDocuments.map((document) => document.id) },
            },
          });
        }

        await tx.driverDocument.createMany({
          data: documentRows,
        });

        await tx.driverVehicle.update({
          where: { id: vehicle.id },
          data: {
            insuranceExpiryDate:
              input.insuranceExpiryDate ?? vehicle.insuranceExpiryDate,
            registrationExpiryDate:
              input.registrationExpiryDate ?? vehicle.registrationExpiryDate,
            status: DriverVehicleReviewStatus.PENDING_REVIEW,
            isActive: false,
            rejectionReason: null,
          },
        });
      });
    } catch (error) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw error;
    }

    await this.cleanupStorageKeys(
      existingDocuments
        .map((document) => document.storageKey)
        .filter((value): value is string => Boolean(value)),
    );

    const documents = await this.prisma.driverDocument.findMany({
      where: {
        driverId: profile.id,
        vehicleId: vehicle.id,
      },
      orderBy: { createdAt: 'asc' },
      select: DRIVER_DOCUMENT_SELECT,
    });

    const hasRequired = this.hasRequiredVehicleDocuments(documents);
    const nextDriverStatus = this.resolveStatusAfterDocuments(
      profile.status,
      hasRequired,
    );

    if (nextDriverStatus !== profile.status) {
      await this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: { status: nextDriverStatus },
      });
      profile.status = nextDriverStatus;
    }

    return {
      vehicle: this.toVehicleResponse(
        {
          ...vehicle,
          insuranceExpiryDate:
            input.insuranceExpiryDate ?? vehicle.insuranceExpiryDate,
          registrationExpiryDate:
            input.registrationExpiryDate ?? vehicle.registrationExpiryDate,
          status: DriverVehicleReviewStatus.PENDING_REVIEW,
          isActive: false,
          rejectionReason: null,
        },
        documents,
      ),
      documents: documents.map((document) => this.toDocumentResponse(document)),
      nextStep: await this.getVehicleDocumentsNextStepForDriver(
        profile.id,
        profile.status,
      ),
    };
  }

  private resolveNextStatus(
    currentStatus: DriverStatus,
    isProfileCompleted: boolean,
  ): DriverStatus {
    if (
      currentStatus === DriverStatus.APPROVED ||
      currentStatus === DriverStatus.SUSPENDED ||
      currentStatus === DriverStatus.REJECTED
    ) {
      return currentStatus;
    }

    if (isProfileCompleted) {
      if (currentStatus === DriverStatus.PENDING_PROFILE) {
        return DriverStatus.PENDING_DOCUMENTS;
      }
      return currentStatus;
    }

    if (
      currentStatus === DriverStatus.PENDING_DOCUMENTS ||
      currentStatus === DriverStatus.PENDING_PROFILE
    ) {
      return DriverStatus.PENDING_PROFILE;
    }

    return currentStatus;
  }

  private async getDriverProfileForOnboardingDocuments(
    userId: string,
  ): Promise<DriverProfileSource> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Driver account not found.');
    }

    if (!user.driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    return user.driverProfile;
  }

  private assertExpiryDateNotPast(value: Date, label: string): void {
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException(`${label} must be a valid date.`);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const normalized = new Date(value);
    normalized.setHours(0, 0, 0, 0);

    if (normalized.getTime() < today.getTime()) {
      throw new BadRequestException(`${label} must not be in the past.`);
    }
  }

  private buildOnboardingDocumentRows(
    driverId: string,
    input: UploadDriverOnboardingDocumentsInput,
  ): Array<{
    driverId: string;
    vehicleId: null;
    type: DriverDocumentType;
    url: string;
    storageKey: string;
    originalName: string | null;
    mimeType: string;
    sizeBytes: number;
    status: DocumentStatus;
    expiresAt: Date | null;
  }> {
    const rows: Array<{
      driverId: string;
      vehicleId: null;
      type: DriverDocumentType;
      url: string;
      storageKey: string;
      originalName: string | null;
      mimeType: string;
      sizeBytes: number;
      status: DocumentStatus;
      expiresAt: Date | null;
    }> = [];

    const mapSingle = (
      fieldFiles: MulterFile[] | undefined,
      type: DriverDocumentType,
      expiresAt?: Date,
    ): void => {
      const file = fieldFiles?.[0];
      if (!file) return;

      const storageKey = relative(process.cwd(), file.path).replace(/\\/g, '/');
      rows.push({
        driverId,
        vehicleId: null,
        type,
        url: `/${storageKey}`,
        storageKey,
        originalName: file.originalname || null,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: DocumentStatus.UPLOADED,
        expiresAt: expiresAt ?? null,
      });
    };

    mapSingle(input.files.personalSelfie, DriverDocumentType.PERSONAL_SELFIE);
    const identityExpiryDate =
      input.idDocumentKind === IdentityDocumentKind.RESIDENCY_CARD
        ? input.idExpiryDate
        : undefined;
    mapSingle(
      input.files.idFront,
      DriverDocumentType.ID_FRONT,
      identityExpiryDate,
    );
    mapSingle(
      input.files.idBack,
      DriverDocumentType.ID_BACK,
      identityExpiryDate,
    );
    mapSingle(
      input.files.drivingLicense,
      DriverDocumentType.DRIVING_LICENSE,
      input.drivingLicenseExpiryDate,
    );
    mapSingle(
      input.files.selfIdentityVerification,
      DriverDocumentType.SELF_IDENTITY_VERIFICATION,
    );

    return rows;
  }

  private async persistDriverProfileUpdate(input: {
    userId: string;
    existingProfile: DriverProfileSource;
    changes: Partial<UpdateDriverProfileInput>;
  }): Promise<DriverProfileSource> {
    const nextFirstName =
      input.changes.firstName !== undefined
        ? input.changes.firstName.trim()
        : input.existingProfile.firstName;
    const nextLastName =
      input.changes.lastName !== undefined
        ? input.changes.lastName.trim()
        : input.existingProfile.lastName;
    const nextPhone =
      input.changes.phone !== undefined
        ? input.changes.phone.trim()
        : input.existingProfile.phone;
    const nextCountryCode =
      input.changes.countryCode !== undefined
        ? input.changes.countryCode?.trim() || null
        : input.existingProfile.countryCode;
    const nextCountryCodes =
      input.changes.countryCodes !== undefined
        ? this.normalizeCountryCodes(input.changes.countryCodes ?? [])
        : input.existingProfile.countryCodes;
    const nextCity =
      input.changes.city !== undefined
        ? input.changes.city?.trim() || null
        : input.existingProfile.city;
    const nextCities =
      input.changes.cities !== undefined
        ? this.normalizeCities(input.changes.cities ?? [])
        : input.existingProfile.cities;
    const nextCoverageAreas =
      input.changes.coverageAreas !== undefined
        ? this.normalizeCoverageAreas(input.changes.coverageAreas ?? [])
        : input.existingProfile.coverageAreas;
    const nextFullNameOnId =
      input.changes.fullNameOnId !== undefined
        ? input.changes.fullNameOnId?.trim() || null
        : input.existingProfile.fullNameOnId;
    const nextDateOfBirth =
      input.changes.dateOfBirth !== undefined
        ? input.changes.dateOfBirth
        : input.existingProfile.dateOfBirth;
    const nextIdOrResidencyNumber =
      input.changes.idOrResidencyNumber !== undefined
        ? input.changes.idOrResidencyNumber?.trim() || null
        : input.existingProfile.idOrResidencyNumber;
    const nextAddressLine1 =
      input.changes.addressLine1 !== undefined
        ? input.changes.addressLine1?.trim() || null
        : input.existingProfile.addressLine1;
    const nextAddressLine2 =
      input.changes.addressLine2 !== undefined
        ? input.changes.addressLine2?.trim() || null
        : input.existingProfile.addressLine2;
    const nextPostalCode =
      input.changes.postalCode !== undefined
        ? input.changes.postalCode?.trim() || null
        : input.existingProfile.postalCode;
    const nextPreferredLanguage =
      input.changes.preferredLanguage !== undefined
        ? (input.changes.preferredLanguage ?? null)
        : input.existingProfile.preferredLanguage;
    const nextEmergencyContactName =
      input.changes.emergencyContactName !== undefined
        ? input.changes.emergencyContactName?.trim() || null
        : input.existingProfile.emergencyContactName;
    const nextEmergencyContactPhone =
      input.changes.emergencyContactPhone !== undefined
        ? input.changes.emergencyContactPhone?.trim() || null
        : input.existingProfile.emergencyContactPhone;
    const nextProfilePhotoUrl =
      input.changes.profilePhotoUrl !== undefined
        ? input.changes.profilePhotoUrl?.trim() || null
        : input.existingProfile.profilePhotoUrl;

    if (nextPhone.length === 0) {
      throw new BadRequestException('phone must not be empty.');
    }

    if (nextDateOfBirth) {
      this.assertMinimumDriverAge(nextDateOfBirth);
    }

    const [existingPhone, existingIdOrResidencyNumber] = await Promise.all([
      this.prisma.driverProfile.findUnique({
        where: { phone: nextPhone },
        select: { userId: true },
      }),
      nextIdOrResidencyNumber
        ? this.prisma.driverProfile.findUnique({
            where: { idOrResidencyNumber: nextIdOrResidencyNumber },
            select: { userId: true },
          })
        : null,
    ]);

    if (existingPhone && existingPhone.userId !== input.userId) {
      throw new ConflictException('Phone is already in use.');
    }

    if (
      existingIdOrResidencyNumber &&
      existingIdOrResidencyNumber.userId !== input.userId
    ) {
      throw new ConflictException('ID or residency number is already in use.');
    }

    const isProfileCompleted = this.isDriverPersonalInfoComplete({
      firstName: nextFirstName,
      lastName: nextLastName,
      phone: nextPhone,
      city: nextCity,
      coverageAreas: nextCoverageAreas,
      fullNameOnId: nextFullNameOnId,
      dateOfBirth: nextDateOfBirth,
      idOrResidencyNumber: nextIdOrResidencyNumber,
    });

    const nextStatus = this.resolveNextStatus(
      input.existingProfile.status,
      isProfileCompleted,
    );

    return this.prisma.driverProfile.update({
      where: { userId: input.userId },
      data: {
        firstName: nextFirstName,
        lastName: nextLastName,
        phone: nextPhone,
        countryCode: nextCountryCodes[0] ?? nextCountryCode,
        countryCodes: nextCountryCodes,
        city: nextCities[0] ?? nextCity,
        cities: nextCities,
        coverageAreas: nextCoverageAreas,
        fullNameOnId: nextFullNameOnId,
        dateOfBirth: nextDateOfBirth ?? null,
        idOrResidencyNumber: nextIdOrResidencyNumber,
        addressLine1: nextAddressLine1,
        addressLine2: nextAddressLine2,
        postalCode: nextPostalCode,
        preferredLanguage: nextPreferredLanguage,
        emergencyContactName: nextEmergencyContactName,
        emergencyContactPhone: nextEmergencyContactPhone,
        profilePhotoUrl: nextProfilePhotoUrl,
        isProfileCompleted,
        status: nextStatus,
      },
      select: DRIVER_ME_SELECT.driverProfile.select,
    });
  }

  private assertMinimumDriverAge(dateOfBirth: Date): void {
    const minimumAgeYears = this.getDriverMinimumAgeYears();
    const adulthoodDate = new Date(dateOfBirth);
    adulthoodDate.setFullYear(adulthoodDate.getFullYear() + minimumAgeYears);

    if (adulthoodDate.getTime() > Date.now()) {
      throw new BadRequestException(
        `Driver must be at least ${minimumAgeYears} years old.`,
      );
    }
  }

  private getDriverMinimumAgeYears(): number {
    const configuredAge = Number.parseInt(
      process.env.DRIVER_MINIMUM_AGE_YEARS ?? '18',
      10,
    );

    return Number.isFinite(configuredAge) && configuredAge >= 18
      ? configuredAge
      : 18;
  }

  private normalizeCoverageAreas(coverageAreas: string[]): string[] {
    return [
      ...new Set(coverageAreas.map((area) => area.trim()).filter(Boolean)),
    ];
  }

  private normalizeCountryCodes(countryCodes: string[]): string[] {
    return [
      ...new Set(
        countryCodes
          .map((countryCode) => countryCode.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
  }

  private normalizeCities(cities: string[]): string[] {
    return [...new Set(cities.map((city) => city.trim()).filter(Boolean))];
  }

  private isDriverPersonalInfoComplete(input: {
    firstName: string;
    lastName: string;
    phone: string;
    city: string | null;
    coverageAreas: string[];
    fullNameOnId: string | null;
    dateOfBirth: Date | null;
    idOrResidencyNumber: string | null;
  }): boolean {
    return (
      input.firstName.trim().length > 0 &&
      input.lastName.trim().length > 0 &&
      input.phone.trim().length > 0 &&
      (input.city?.trim().length ?? 0) + input.coverageAreas.length > 0 &&
      (input.fullNameOnId?.trim().length ?? 0) > 0 &&
      Boolean(input.dateOfBirth) &&
      (input.idOrResidencyNumber?.trim().length ?? 0) > 0
    );
  }

  private maskIdOrResidencyNumber(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const trimmedValue = value.trim();
    const visibleCharacters = trimmedValue.slice(-4);
    const maskedPrefix = '*'.repeat(Math.max(0, trimmedValue.length - 4));

    return `${maskedPrefix}${visibleCharacters}`;
  }

  private getOnboardingNextStep(
    profile: DriverProfileSource,
  ): DriverOnboardingNextStep {
    if (
      !profile.isProfileCompleted ||
      profile.status === DriverStatus.PENDING_PROFILE
    ) {
      return 'COMPLETE_PROFILE';
    }

    if (profile.status === DriverStatus.PENDING_DOCUMENTS) {
      return 'UPLOAD_DOCUMENTS';
    }

    if (
      profile.status === DriverStatus.PENDING_REVIEW ||
      profile.status === DriverStatus.SUSPENDED ||
      profile.status === DriverStatus.REJECTED
    ) {
      return 'WAITING_APPROVAL';
    }

    return 'HOME';
  }

  private getNextStep(
    profile: DriverProfileSource,
    availability?: AvailabilitySource | null,
  ): DriverNextStep {
    if (
      !profile.isProfileCompleted ||
      profile.status === DriverStatus.PENDING_PROFILE
    ) {
      return 'COMPLETE_PROFILE';
    }

    if (profile.status === DriverStatus.PENDING_DOCUMENTS) {
      return 'ADD_VEHICLE_DOCUMENTS';
    }

    if (
      profile.status === DriverStatus.SUSPENDED ||
      profile.status === DriverStatus.REJECTED
    ) {
      return 'WAITING_APPROVAL';
    }

    if (profile.status === DriverStatus.PENDING_REVIEW) {
      if (!availability || !this.isStoredAvailabilityValid(availability)) {
        return 'SET_AVAILABILITY';
      }
      return 'WAITING_APPROVAL';
    }

    if (profile.status === DriverStatus.APPROVED) {
      return 'HOME';
    }

    return 'WAITING_APPROVAL';
  }

  private getVehicleDocumentsNextStep(
    status: DriverStatus,
    vehicles: Array<VehicleSource & { documents: DocumentSource[] }>,
  ): DriverNextStep {
    if (status === DriverStatus.PENDING_PROFILE) {
      return 'COMPLETE_PROFILE';
    }

    if (status === DriverStatus.PENDING_REVIEW) {
      return 'WAITING_APPROVAL';
    }

    if (status === DriverStatus.SUSPENDED || status === DriverStatus.REJECTED) {
      return 'WAITING_APPROVAL';
    }

    const hasVehicleReadyForDocumentsStep = vehicles.some(
      (vehicle) =>
        this.hasRequiredVehicleDocuments(vehicle.documents) &&
        this.hasVehicleLoadCapacityProfile(vehicle),
    );

    if (!hasVehicleReadyForDocumentsStep) {
      return 'ADD_VEHICLE_DOCUMENTS';
    }

    const hasApprovedVehicleReady = vehicles.some(
      (vehicle) =>
        vehicle.isActive &&
        vehicle.status === DriverVehicleReviewStatus.APPROVED &&
        this.hasRequiredVehicleDocuments(vehicle.documents) &&
        this.hasVehicleLoadCapacityProfile(vehicle),
    );

    if (!hasApprovedVehicleReady) {
      return 'WAITING_APPROVAL';
    }

    if (status === DriverStatus.APPROVED) {
      return 'HOME';
    }

    return 'SET_AVAILABILITY';
  }

  private async getVehicleDocumentsNextStepForDriver(
    driverId: string,
    status: DriverStatus,
  ): Promise<DriverNextStep> {
    const vehicles = await this.prisma.driverVehicle.findMany({
      where: {
        driverId,
        isActive: true,
      },
      select: {
        ...DRIVER_VEHICLE_SELECT,
        documents: {
          orderBy: { createdAt: 'asc' },
          select: DRIVER_DOCUMENT_SELECT,
        },
      },
    });

    return this.getVehicleDocumentsNextStep(status, vehicles);
  }

  private resolveStatusAfterDocuments(
    currentStatus: DriverStatus,
    hasRequiredDocs: boolean,
  ): DriverStatus {
    if (
      currentStatus === DriverStatus.APPROVED ||
      currentStatus === DriverStatus.SUSPENDED ||
      currentStatus === DriverStatus.REJECTED
    ) {
      return currentStatus;
    }

    return DriverStatus.PENDING_DOCUMENTS;
  }

  private hasRequiredVehicleDocuments(
    documents: Array<{ type: DriverDocumentType; status?: DocumentStatus }>,
  ): boolean {
    const eligibleDocuments = documents.filter(
      (document) => document.status !== DocumentStatus.REJECTED,
    );

    const hasCanonicalPhotoSet =
      eligibleDocuments.some(
        (doc) => doc.type === DriverDocumentType.VEHICLE_FRONT_PHOTO,
      ) &&
      eligibleDocuments.some(
        (doc) => doc.type === DriverDocumentType.VEHICLE_REAR_PHOTO,
      ) &&
      eligibleDocuments.some(
        (doc) => doc.type === DriverDocumentType.VEHICLE_SIDE_PHOTO,
      ) &&
      eligibleDocuments.some(
        (doc) => doc.type === DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO,
      );
    const hasCanonicalDocumentSet =
      eligibleDocuments.some(
        (doc) => doc.type === DriverDocumentType.VEHICLE_REGISTRATION_FRONT,
      ) &&
      eligibleDocuments.some(
        (doc) => doc.type === DriverDocumentType.VEHICLE_REGISTRATION_BACK,
      ) &&
      eligibleDocuments.some(
        (doc) => doc.type === DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT,
      );

    if (hasCanonicalPhotoSet && hasCanonicalDocumentSet) {
      return true;
    }

    const hasLicenseFront = eligibleDocuments.some(
      (doc) => doc.type === DriverDocumentType.DRIVER_LICENSE_FRONT,
    );
    const hasLicenseBack = eligibleDocuments.some(
      (doc) => doc.type === DriverDocumentType.DRIVER_LICENSE_BACK,
    );
    const hasIdentity = eligibleDocuments.some(
      (doc) =>
        doc.type === DriverDocumentType.IDENTITY_DOCUMENT ||
        doc.type === DriverDocumentType.PASSPORT,
    );
    const hasVehicleRegistration = eligibleDocuments.some(
      (doc) => doc.type === DriverDocumentType.VEHICLE_REGISTRATION,
    );
    const hasVehicleInsurance = eligibleDocuments.some(
      (doc) => doc.type === DriverDocumentType.VEHICLE_INSURANCE,
    );
    const hasVehiclePhoto = eligibleDocuments.some(
      (doc) => doc.type === DriverDocumentType.VEHICLE_PHOTO,
    );

    return (
      hasLicenseFront &&
      hasLicenseBack &&
      hasIdentity &&
      hasVehicleRegistration &&
      hasVehicleInsurance &&
      hasVehiclePhoto
    );
  }

  private getMissingCanonicalVehicleUploads(
    files: UploadDriverVehicleDocumentsInput['files'],
    vehicle: VehicleSource,
  ): string[] {
    const latestExistingDocuments = new Set(
      (
        vehicle as VehicleSource & { documents?: DocumentSource[] }
      ).documents?.map((document) => document.type) ?? [],
    );

    const hasFieldFile = (
      field: keyof UploadDriverVehicleDocumentsInput['files'],
    ): boolean => Boolean(files[field]?.length);

    const missing: string[] = [];
    if (
      !hasFieldFile('frontPhoto') &&
      !latestExistingDocuments.has(DriverDocumentType.VEHICLE_FRONT_PHOTO)
    ) {
      missing.push('frontPhoto');
    }
    if (
      !hasFieldFile('rearPhoto') &&
      !latestExistingDocuments.has(DriverDocumentType.VEHICLE_REAR_PHOTO)
    ) {
      missing.push('rearPhoto');
    }
    if (
      !hasFieldFile('sidePhoto') &&
      !latestExistingDocuments.has(DriverDocumentType.VEHICLE_SIDE_PHOTO)
    ) {
      missing.push('sidePhoto');
    }
    if (
      !hasFieldFile('licensePlatePhoto') &&
      !latestExistingDocuments.has(
        DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO,
      )
    ) {
      missing.push('licensePlatePhoto');
    }
    if (
      !hasFieldFile('registrationFrontDocument') &&
      !latestExistingDocuments.has(
        DriverDocumentType.VEHICLE_REGISTRATION_FRONT,
      )
    ) {
      missing.push('registrationFrontDocument');
    }
    if (
      !hasFieldFile('registrationBackDocument') &&
      !latestExistingDocuments.has(DriverDocumentType.VEHICLE_REGISTRATION_BACK)
    ) {
      missing.push('registrationBackDocument');
    }
    if (
      !hasFieldFile('insuranceDocument') &&
      !latestExistingDocuments.has(
        DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT,
      )
    ) {
      missing.push('insuranceDocument');
    }

    return missing;
  }

  private buildDocumentRows(
    driverId: string,
    vehicleId: string,
    files: UploadDriverVehicleDocumentsInput['files'],
  ): Array<{
    driverId: string;
    vehicleId: string;
    type: DriverDocumentType;
    url: string;
    storageKey: string;
    originalName: string | null;
    mimeType: string;
    sizeBytes: number;
    status: DocumentStatus;
    expiresAt?: Date | null;
  }> {
    const rows: Array<{
      driverId: string;
      vehicleId: string;
      type: DriverDocumentType;
      url: string;
      storageKey: string;
      originalName: string | null;
      mimeType: string;
      sizeBytes: number;
      status: DocumentStatus;
      expiresAt?: Date | null;
    }> = [];

    const mapSingle = (
      fieldFiles: MulterFile[] | undefined,
      type: DriverDocumentType,
      expiresAt?: Date | null,
    ): void => {
      const file = fieldFiles?.[0];
      if (!file) return;

      const storageKey = relative(process.cwd(), file.path).replace(/\\/g, '/');
      rows.push({
        driverId,
        vehicleId,
        type,
        url: `/${storageKey}`,
        storageKey,
        originalName: file.originalname || null,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: DocumentStatus.PENDING_REVIEW,
        expiresAt: expiresAt ?? null,
      });
    };

    mapSingle(files.frontPhoto, DriverDocumentType.VEHICLE_FRONT_PHOTO);
    mapSingle(files.rearPhoto, DriverDocumentType.VEHICLE_REAR_PHOTO);
    mapSingle(files.sidePhoto, DriverDocumentType.VEHICLE_SIDE_PHOTO);
    mapSingle(
      files.licensePlatePhoto,
      DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO,
    );
    mapSingle(
      files.registrationFrontDocument,
      DriverDocumentType.VEHICLE_REGISTRATION_FRONT,
      files.registrationFrontDocument?.[0] ? null : undefined,
    );
    mapSingle(
      files.registrationBackDocument,
      DriverDocumentType.VEHICLE_REGISTRATION_BACK,
      files.registrationBackDocument?.[0] ? null : undefined,
    );
    mapSingle(
      files.insuranceDocument,
      DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT,
    );

    if (
      !files.registrationFrontDocument?.length &&
      files.vehicleRegistration?.length
    ) {
      mapSingle(
        files.vehicleRegistration,
        DriverDocumentType.VEHICLE_REGISTRATION,
      );
    }

    if (!files.insuranceDocument?.length && files.vehicleInsurance?.length) {
      mapSingle(files.vehicleInsurance, DriverDocumentType.VEHICLE_INSURANCE);
    }

    for (const [index, file] of (files.vehiclePhotos ?? []).entries()) {
      const storageKey = relative(process.cwd(), file.path).replace(/\\/g, '/');
      const fallbackType =
        index === 0
          ? DriverDocumentType.VEHICLE_FRONT_PHOTO
          : index === 1
            ? DriverDocumentType.VEHICLE_REAR_PHOTO
            : index === 2
              ? DriverDocumentType.VEHICLE_SIDE_PHOTO
              : index === 3
                ? DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO
                : DriverDocumentType.VEHICLE_PHOTO;
      rows.push({
        driverId,
        vehicleId,
        type: fallbackType,
        url: `/${storageKey}`,
        storageKey,
        originalName: file.originalname || null,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: DocumentStatus.PENDING_REVIEW,
        expiresAt: null,
      });
    }

    return rows;
  }

  private ensureDriverOnboardingForAlerts(profile: {
    status: DriverStatus;
    isProfileCompleted: boolean;
  }): void {
    if (
      !profile.isProfileCompleted ||
      profile.status === DriverStatus.PENDING_PROFILE
    ) {
      throw new BadRequestException('Driver profile must be completed first.');
    }

    if (
      profile.status === DriverStatus.SUSPENDED ||
      profile.status === DriverStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Driver account is not eligible for request alerts.',
      );
    }

    // TODO: once manual review flow is finalized, restrict to APPROVED only.
    if (
      profile.status !== DriverStatus.APPROVED &&
      profile.status !== DriverStatus.PENDING_REVIEW
    ) {
      throw new BadRequestException(
        'Driver is not ready to receive request alerts.',
      );
    }
  }

  private async getApprovedDriverVehicles(
    driverId: string,
  ): Promise<VehicleSource[]> {
    const vehicles = await this.prisma.driverVehicle.findMany({
      where: {
        driverId,
        isActive: true,
        status: DriverVehicleReviewStatus.APPROVED,
      },
      select: DRIVER_VEHICLE_SELECT,
    });

    if (vehicles.length === 0) {
      throw new BadRequestException('At least one active vehicle is required.');
    }

    return vehicles;
  }

  private async syncOpenRequestAlertsForDriver(
    driverId: string,
  ): Promise<void> {
    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId },
      select: {
        id: true,
        isOnline: true,
        baseLatitude: true,
        baseLongitude: true,
        serviceRadiusKm: true,
      },
    });

    if (!availability?.isOnline) {
      return;
    }

    const vehicles = await this.prisma.driverVehicle.findMany({
      where: {
        driverId,
        isActive: true,
        status: DriverVehicleReviewStatus.APPROVED,
      },
      select: DRIVER_VEHICLE_SELECT,
    });

    if (vehicles.length === 0) {
      return;
    }

    const requests = await this.prisma.transportRequest.findMany({
      where: {
        status: TransportRequestStatus.PENDING_QUOTES,
        pickupLatitude: { not: null },
        pickupLongitude: { not: null },
        dropoffLatitude: { not: null },
        dropoffLongitude: { not: null },
        itemTitle: { not: null },
        itemType: { not: null },
        OR: [{ isImmediate: true }, { scheduledPickupAt: { not: null } }],
      },
      select: DRIVER_REQUEST_DETAILS_SELECT,
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });

    for (const request of requests as RequestDetailsSource[]) {
      const existingAlert = request.driverAlerts.find(
        (alert) => alert.driverId === driverId,
      );
      if (
        existingAlert &&
        (existingAlert.status === DriverRequestAlertStatus.IGNORED ||
          existingAlert.status === DriverRequestAlertStatus.ACCEPTED ||
          existingAlert.status === DriverRequestAlertStatus.EXPIRED)
      ) {
        continue;
      }

      if (
        !request.service ||
        !this.hasCompatibleDriverVehicleForRequest(request, vehicles)
      ) {
        continue;
      }

      const distanceKm = this.calculateDistanceKm(
        availability.baseLatitude,
        availability.baseLongitude,
        request.pickupLatitude,
        request.pickupLongitude,
      );
      if (
        distanceKm !== null &&
        availability.serviceRadiusKm > 0 &&
        distanceKm > availability.serviceRadiusKm
      ) {
        continue;
      }

      const alert =
        existingAlert ??
        (await this.ensureDriverRequestAlert({
          requestId: request.id,
          driverId,
        }));

      if (
        !existingAlert &&
        this.tripsGateway.getDriverConnectionCount(driverId) > 0
      ) {
        this.tripsGateway.emitRequestNew(
          driverId,
          this.toRequestAlertSummary(request, alert, distanceKm),
        );
      }
    }
  }

  private async getApprovedDriverVehiclesTx(
    tx: Prisma.TransactionClient,
    driverId: string,
  ): Promise<VehicleSource[]> {
    const vehicles = await tx.driverVehicle.findMany({
      where: {
        driverId,
        isActive: true,
        status: DriverVehicleReviewStatus.APPROVED,
      },
      select: DRIVER_VEHICLE_SELECT,
    });

    if (vehicles.length === 0) {
      throw new BadRequestException('At least one active vehicle is required.');
    }

    return vehicles;
  }

  private validateOfferInput(input: SendDriverPriceOfferInput): void {
    if (
      !Number.isFinite(input.price) ||
      input.price < 1 ||
      input.price > 100000
    ) {
      throw new BadRequestException('price must be between 1 and 100000.');
    }

    if (!input.currency?.trim()) {
      throw new BadRequestException('currency is required.');
    }

    if (
      input.estimatedPickupAt &&
      Number.isNaN(input.estimatedPickupAt.getTime())
    ) {
      throw new BadRequestException(
        'estimatedPickupAt must be a valid ISO date.',
      );
    }

    if (
      input.estimatedDeliveryAt &&
      Number.isNaN(input.estimatedDeliveryAt.getTime())
    ) {
      throw new BadRequestException(
        'estimatedDeliveryAt must be a valid ISO date.',
      );
    }

    if (
      input.estimatedPickupAt &&
      input.estimatedPickupAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('estimatedPickupAt must be in the future.');
    }

    if (
      input.estimatedPickupAt &&
      input.estimatedDeliveryAt &&
      input.estimatedDeliveryAt.getTime() <= input.estimatedPickupAt.getTime()
    ) {
      throw new BadRequestException(
        'estimatedDeliveryAt must be after estimatedPickupAt.',
      );
    }

    if (
      input.estimatedDurationMinutes !== undefined &&
      (!Number.isInteger(input.estimatedDurationMinutes) ||
        input.estimatedDurationMinutes < 1 ||
        input.estimatedDurationMinutes > 10080)
    ) {
      throw new BadRequestException(
        'estimatedDurationMinutes must be between 1 and 10080.',
      );
    }

    if (input.message && input.message.trim().length > 1000) {
      throw new BadRequestException('message must be at most 1000 characters.');
    }
  }

  private isServiceCompatibleWithDriverVehicles(
    serviceKey: ServiceKey,
    vehicleTypes: Set<VehicleType>,
  ): boolean {
    const serviceVehicleTypeMap: Record<ServiceKey, VehicleType[]> = {
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

    const allowedTypes = serviceVehicleTypeMap[serviceKey];
    return allowedTypes.some((vehicleType) => vehicleTypes.has(vehicleType));
  }

  private hasCompatibleDriverVehicleForRequest(
    request: RequestDetailsSource & { service: { key: ServiceKey } | null },
    vehicles: VehicleSource[],
  ): boolean {
    if (!request.service) {
      return false;
    }

    const requestDate = request.isImmediate
      ? new Date()
      : (request.scheduledPickupAt ?? new Date());

    return vehicles.some((vehicle) => {
      if (
        !this.isServiceCompatibleWithDriverVehicles(
          request.service!.key,
          new Set([vehicle.vehicleType]),
        )
      ) {
        return false;
      }

      const workingSchedule = this.parseVehicleWorkingSchedule(
        vehicle.workingSchedule,
      );
      if (!isWorkingScheduleAvailableForDate(workingSchedule, requestDate)) {
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
          workingSchedule,
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

  private async ensureDriverRequestAlert(input: {
    requestId: string;
    driverId: string;
  }): Promise<RequestAlertSource> {
    return this.prisma.driverRequestAlert.upsert({
      where: {
        requestId_driverId: {
          requestId: input.requestId,
          driverId: input.driverId,
        },
      },
      update: {},
      create: {
        requestId: input.requestId,
        driverId: input.driverId,
        status: DriverRequestAlertStatus.NEW,
      },
      select: DRIVER_REQUEST_ALERT_SELECT,
    });
  }

  private toRequestAlertSummary(
    request: RequestDetailsSource,
    alert: RequestAlertSource,
    distanceKm: number | null,
  ): DriverRequestAlertSummaryDto {
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
      submittedAt: request.submittedAt
        ? request.submittedAt.toISOString()
        : null,
    };
  }

  private toRequestDetailsResponse(
    request: RequestDetailsSource,
    alert: RequestAlertSource,
    distanceKm: number | null,
    offerStatus: DriverOfferStatus | null,
  ): DriverRequestDetailsResponseDto {
    const summary = this.toRequestAlertSummary(request, alert, distanceKm);
    const customerFirstName = request.customer?.name
      ? (request.customer.name.trim().split(/\s+/)[0] ?? null)
      : null;

    return {
      ...summary,
      offerStatus,
      customer: {
        firstName: customerFirstName,
        rating: null,
      },
      itemDetails: {
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
      },
      photos: request.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        sortOrder: photo.sortOrder,
        createdAt: photo.createdAt.toISOString(),
      })),
    };
  }

  private validateAndNormalizeWeeklySchedule(
    schedule: DriverAvailabilityDayInput[] | DriverAvailabilityDayDto[],
  ): Array<{
    dayOfWeek: DayOfWeek;
    isAvailable: boolean;
    startTime: string | null;
    endTime: string | null;
  }> {
    if (schedule.length !== WEEK_DAYS_ORDER.length) {
      throw new BadRequestException(
        'weeklySchedule must include exactly 7 days.',
      );
    }

    const dayMap = new Map<
      DayOfWeek,
      DriverAvailabilityDayInput | DriverAvailabilityDayDto
    >();
    for (const item of schedule) {
      if (dayMap.has(item.dayOfWeek)) {
        throw new BadRequestException('weeklySchedule days must be unique.');
      }
      dayMap.set(item.dayOfWeek, item);
    }

    for (const day of WEEK_DAYS_ORDER) {
      if (!dayMap.has(day)) {
        throw new BadRequestException(
          'weeklySchedule must contain all days from MONDAY to SUNDAY.',
        );
      }
    }

    const normalized = WEEK_DAYS_ORDER.map((day) => {
      const item = dayMap.get(day)!;
      const startTime = item.startTime?.trim() || null;
      const endTime = item.endTime?.trim() || null;

      if (item.isAvailable) {
        if (!startTime || !endTime) {
          throw new BadRequestException(
            `startTime and endTime are required when ${day} is available.`,
          );
        }

        if (!TIME_24H_REGEX.test(startTime) || !TIME_24H_REGEX.test(endTime)) {
          throw new BadRequestException(
            'startTime and endTime must be in HH:mm format.',
          );
        }

        if (!this.isEndTimeAfterStartTime(startTime, endTime)) {
          throw new BadRequestException(
            `endTime must be after startTime for ${day}.`,
          );
        }
      }

      return {
        dayOfWeek: day,
        isAvailable: item.isAvailable,
        startTime: item.isAvailable ? startTime : null,
        endTime: item.isAvailable ? endTime : null,
      };
    });

    if (!normalized.some((entry) => entry.isAvailable)) {
      throw new BadRequestException(
        'At least one weekly schedule day must be available.',
      );
    }

    return normalized;
  }

  private isEndTimeAfterStartTime(start: string, end: string): boolean {
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    return endTotal > startTotal;
  }

  private isValidIanaTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureDriverVehicleDocumentsReady(
    driverId: string,
  ): Promise<void> {
    const hasEligibleVehicle =
      await this.hasVehicleReadyForAvailability(driverId);
    if (!hasEligibleVehicle) {
      throw new BadRequestException(
        'At least one approved active vehicle with load profile and required documents must be completed before setting availability.',
      );
    }
  }

  private async hasVehicleReadyForAvailability(
    driverId: string,
  ): Promise<boolean> {
    const vehicles = await this.prisma.driverVehicle.findMany({
      where: {
        driverId,
        isActive: true,
        status: DriverVehicleReviewStatus.APPROVED,
      },
      select: {
        vehicleType: true,
        capacityKg: true,
        lengthCm: true,
        widthCm: true,
        heightCm: true,
        allowedCargoTypes: true,
        workingSchedule: true,
        id: true,
        documents: {
          select: {
            type: true,
            status: true,
          },
        },
      },
    });

    return vehicles.some((vehicle) => {
      const hasRequiredDocuments = this.hasRequiredVehicleDocuments(
        vehicle.documents.filter(
          (document) => document.status !== DocumentStatus.REJECTED,
        ),
      );

      return hasRequiredDocuments && this.hasVehicleLoadCapacityProfile(vehicle);
    });
  }

  private resolveStatusAfterAvailability(
    currentStatus: DriverStatus,
  ): DriverStatus {
    if (
      currentStatus === DriverStatus.APPROVED ||
      currentStatus === DriverStatus.SUSPENDED ||
      currentStatus === DriverStatus.REJECTED
    ) {
      return currentStatus;
    }

    if (
      currentStatus === DriverStatus.PENDING_DOCUMENTS ||
      currentStatus === DriverStatus.PENDING_REVIEW
    ) {
      return DriverStatus.PENDING_REVIEW;
    }

    return currentStatus;
  }

  private isStoredAvailabilityValid(availability: AvailabilitySource): boolean {
    if (!this.isValidIanaTimezone(availability.timezone)) {
      return false;
    }

    if (
      availability.serviceRadiusKm < 1 ||
      availability.serviceRadiusKm > 500
    ) {
      return false;
    }

    if (
      (availability.baseLatitude === null) !==
      (availability.baseLongitude === null)
    ) {
      return false;
    }

    if (
      !availability.acceptsImmediateRequests &&
      !availability.acceptsScheduledRequests
    ) {
      return false;
    }

    if (availability.schedule.length !== WEEK_DAYS_ORDER.length) {
      return false;
    }

    const seenDays = new Set<DayOfWeek>();
    for (const day of availability.schedule) {
      if (seenDays.has(day.dayOfWeek)) {
        return false;
      }
      seenDays.add(day.dayOfWeek);

      if (!day.isAvailable) {
        continue;
      }

      if (!day.startTime || !day.endTime) {
        return false;
      }

      if (
        !TIME_24H_REGEX.test(day.startTime) ||
        !TIME_24H_REGEX.test(day.endTime)
      ) {
        return false;
      }

      if (!this.isEndTimeAfterStartTime(day.startTime, day.endTime)) {
        return false;
      }
    }

    return availability.schedule.some((day) => day.isAvailable);
  }

  private ensureDriverCanGoOnline(
    status: DriverStatus,
    hasEligibleVehicle: boolean,
    isOnlineRequested = true,
  ): void {
    if (!isOnlineRequested) {
      return;
    }

    if (status === DriverStatus.SUSPENDED || status === DriverStatus.REJECTED) {
      throw new BadRequestException(
        'Suspended or rejected drivers cannot go online.',
      );
    }

    if (!hasEligibleVehicle) {
      throw new BadRequestException(
        'At least one active vehicle with load profile and required documents is needed to go online.',
      );
    }

    if (status !== DriverStatus.APPROVED) {
      throw new BadRequestException(
        'Driver must be approved before going online.',
      );
    }
  }

  private normalizeVehicleLoadCapacityInput(input: {
    vehicleType: VehicleType;
    name?: string;
    maxLoadKg?: number;
    cargoLengthM?: number;
    cargoWidthM?: number;
    cargoHeightM?: number;
    dimensionsAreStandard?: boolean;
    allowedCargoTypes: VehicleCargoType[];
    workingSchedule: WorkingDayScheduleValue[];
    isDefault?: boolean;
  }): {
    name: string | null;
    maxLoadKg: number | null;
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
    dimensionsAreStandard: boolean;
    allowedCargoTypes: VehicleCargoType[];
    workingSchedule: WorkingDayScheduleValue[];
    isDefault: boolean;
  } {
    const isCarCarrier = isCarCarrierVehicleType(input.vehicleType);
    const dimensionsAreStandard = input.dimensionsAreStandard ?? isCarCarrier;

    if (
      !input.allowedCargoTypes.length ||
      input.allowedCargoTypes.some(
        (value) => !Object.values(VehicleCargoType).includes(value),
      )
    ) {
      throw new BadRequestException(
        'allowedCargoTypes must contain at least one valid cargo type.',
      );
    }

    if (!isCarCarrier) {
      if (input.maxLoadKg === undefined || input.maxLoadKg <= 0) {
        throw new BadRequestException(
          'maxLoadKg is required for non-car-carrier vehicles.',
        );
      }
      if (input.cargoLengthM === undefined || input.cargoLengthM <= 0) {
        throw new BadRequestException(
          'cargoLengthM is required for non-car-carrier vehicles.',
        );
      }
      if (input.cargoWidthM === undefined || input.cargoWidthM <= 0) {
        throw new BadRequestException(
          'cargoWidthM is required for non-car-carrier vehicles.',
        );
      }
      if (input.cargoHeightM === undefined || input.cargoHeightM <= 0) {
        throw new BadRequestException(
          'cargoHeightM is required for non-car-carrier vehicles.',
        );
      }
    }

    return {
      name: input.name?.trim() || null,
      maxLoadKg: input.maxLoadKg ?? null,
      lengthCm:
        input.cargoLengthM !== undefined ? input.cargoLengthM * 100 : null,
      widthCm: input.cargoWidthM !== undefined ? input.cargoWidthM * 100 : null,
      heightCm:
        input.cargoHeightM !== undefined ? input.cargoHeightM * 100 : null,
      dimensionsAreStandard: isCarCarrier ? true : dimensionsAreStandard,
      allowedCargoTypes: [...new Set(input.allowedCargoTypes)],
      workingSchedule: input.workingSchedule,
      isDefault: Boolean(input.isDefault),
    };
  }

  private validateLoadCapacitySchedule(
    schedule: UpsertDriverVehicleLoadCapacityDto['workingSchedule'],
  ): WorkingDayScheduleValue[] {
    if (!Array.isArray(schedule) || schedule.length === 0) {
      throw new BadRequestException('workingSchedule is required.');
    }

    const seenDays = new Set<DayOfWeek>();
    let hasAvailableDay = false;

    return schedule
      .map((day) => {
        if (seenDays.has(day.dayOfWeek)) {
          throw new BadRequestException('workingSchedule days must be unique.');
        }
        seenDays.add(day.dayOfWeek);

        const normalizedRanges = day.timeRanges
          .map((range) => {
            if (range.startTime >= range.endTime) {
              throw new BadRequestException(
                `startTime must be before endTime for ${day.dayOfWeek}.`,
              );
            }
            return {
              startTime: range.startTime,
              endTime: range.endTime,
            };
          })
          .sort((left, right) => left.startTime.localeCompare(right.startTime));

        for (let index = 1; index < normalizedRanges.length; index += 1) {
          if (
            normalizedRanges[index - 1].endTime >
            normalizedRanges[index].startTime
          ) {
            throw new BadRequestException(
              `workingSchedule time ranges must not overlap for ${day.dayOfWeek}.`,
            );
          }
        }

        if (day.isAvailable) {
          if (normalizedRanges.length === 0) {
            throw new BadRequestException(
              `workingSchedule must include at least one time range for ${day.dayOfWeek}.`,
            );
          }
          hasAvailableDay = true;
        }

        return {
          dayOfWeek: day.dayOfWeek,
          isAvailable: day.isAvailable,
          timeRanges: normalizedRanges,
        };
      })
      .sort(
        (left, right) =>
          WEEK_DAYS_ORDER.indexOf(left.dayOfWeek) -
          WEEK_DAYS_ORDER.indexOf(right.dayOfWeek),
      )
      .map((day) => {
        if (!hasAvailableDay) {
          throw new BadRequestException(
            'workingSchedule must contain at least one available day.',
          );
        }
        return day;
      });
  }

  private parseVehicleWorkingSchedule(
    raw: Prisma.JsonValue | null,
  ): WorkingDayScheduleValue[] {
    if (!raw || !Array.isArray(raw)) {
      return [];
    }

    const result: WorkingDayScheduleValue[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }
      const scheduleEntry = entry as Record<string, unknown>;
      const dayOfWeek = scheduleEntry.dayOfWeek;
      const isAvailable = scheduleEntry.isAvailable;
      const timeRanges = scheduleEntry.timeRanges;
      if (
        typeof dayOfWeek !== 'string' ||
        !Object.values(DayOfWeek).includes(dayOfWeek as DayOfWeek) ||
        typeof isAvailable !== 'boolean' ||
        !Array.isArray(timeRanges)
      ) {
        continue;
      }
      result.push({
        dayOfWeek: dayOfWeek as DayOfWeek,
        isAvailable,
        timeRanges: timeRanges.flatMap((range) => {
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
          return [
            {
              startTime: timeRange.startTime,
              endTime: timeRange.endTime,
            },
          ];
        }),
      });
    }

    return result;
  }

  private toVehicleLoadCapacityResponse(
    vehicle: VehicleSource,
  ): DriverVehicleLoadCapacityResponseDto {
    const workingSchedule = this.parseVehicleWorkingSchedule(
      vehicle.workingSchedule,
    );
    return {
      id: vehicle.id,
      driverId: vehicle.driverId,
      vehicleId: vehicle.id,
      name: vehicle.loadProfileName,
      vehicleType: toDriverVehicleApiType(vehicle.vehicleType),
      maxLoadKg: vehicle.capacityKg,
      cargoLengthM: vehicle.lengthCm !== null ? vehicle.lengthCm / 100 : null,
      cargoWidthM: vehicle.widthCm !== null ? vehicle.widthCm / 100 : null,
      cargoHeightM: vehicle.heightCm !== null ? vehicle.heightCm / 100 : null,
      dimensionsAreStandard: vehicle.dimensionsAreStandard,
      allowedCargoTypes: vehicle.allowedCargoTypes,
      workingSchedule: workingSchedule,
      isDefault: vehicle.isDefaultLoadProfile,
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
    };
  }

  private toAvailabilityResponse(
    profile: { id: string; status: DriverStatus; isProfileCompleted: boolean },
    availability: AvailabilitySource | null,
  ): DriverAvailabilityResponseDto {
    const fallbackSchedule = WEEK_DAYS_ORDER.map((day) => ({
      dayOfWeek: day,
      isAvailable: false,
      startTime: null,
      endTime: null,
    }));

    if (!availability) {
      return {
        id: null,
        driverId: profile.id,
        timezone: 'UTC',
        isOnline: false,
        serviceRadiusKm: 30,
        baseLatitude: null,
        baseLongitude: null,
        baseAddress: null,
        acceptsImmediateRequests: true,
        acceptsScheduledRequests: true,
        weeklySchedule: fallbackSchedule,
        nextStep: 'SET_AVAILABILITY',
        driverStatus: profile.status,
        createdAt: null,
        updatedAt: null,
      };
    }

    const scheduleMap = new Map(
      availability.schedule.map((day) => [day.dayOfWeek, day]),
    );

    const orderedSchedule = WEEK_DAYS_ORDER.map((day) => {
      const value = scheduleMap.get(day);
      return {
        dayOfWeek: day,
        isAvailable: value?.isAvailable ?? false,
        startTime: value?.startTime ?? null,
        endTime: value?.endTime ?? null,
      };
    });

    return {
      id: availability.id,
      driverId: availability.driverId,
      timezone: availability.timezone,
      isOnline: availability.isOnline,
      serviceRadiusKm: availability.serviceRadiusKm,
      baseLatitude: availability.baseLatitude,
      baseLongitude: availability.baseLongitude,
      baseAddress: availability.baseAddress,
      acceptsImmediateRequests: availability.acceptsImmediateRequests,
      acceptsScheduledRequests: availability.acceptsScheduledRequests,
      weeklySchedule: orderedSchedule,
      nextStep: this.getAvailabilityNextStep(profile.status, availability),
      driverStatus: profile.status,
      createdAt: availability.createdAt.toISOString(),
      updatedAt: availability.updatedAt.toISOString(),
    };
  }

  private getAvailabilityNextStep(
    status: DriverStatus,
    availability: AvailabilitySource,
  ): DriverNextStep {
    if (status === DriverStatus.PENDING_PROFILE) {
      return 'COMPLETE_PROFILE';
    }

    if (status === DriverStatus.PENDING_DOCUMENTS) {
      return 'ADD_VEHICLE_DOCUMENTS';
    }

    if (!this.isStoredAvailabilityValid(availability)) {
      return 'SET_AVAILABILITY';
    }

    if (status === DriverStatus.APPROVED) {
      return 'HOME';
    }

    return 'WAITING_APPROVAL';
  }

  private async validateDriverCanViewEarnings(userId: string): Promise<{
    id: string;
    status: DriverStatus;
  }> {
    const profile = await this.ensureDriverProfile(userId);
    if (
      profile.status === DriverStatus.SUSPENDED ||
      profile.status === DriverStatus.REJECTED
    ) {
      throw new ForbiddenException('Driver is not allowed to view earnings.');
    }
    return profile;
  }

  private validateDateRange(
    from?: string,
    to?: string,
  ): { from: Date; to: Date } | null {
    if (!from && !to) return null;

    const parsedFrom = from
      ? new Date(from)
      : new Date('1970-01-01T00:00:00.000Z');
    const parsedTo = to ? new Date(to) : new Date();

    if (
      Number.isNaN(parsedFrom.getTime()) ||
      Number.isNaN(parsedTo.getTime())
    ) {
      throw new BadRequestException('Invalid date range.');
    }

    if (parsedFrom.getTime() > parsedTo.getTime()) {
      throw new BadRequestException('from must be before to.');
    }

    return { from: parsedFrom, to: parsedTo };
  }

  private normalizePage(page: number): number {
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer.');
    }
    return page;
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100.');
    }
    return limit;
  }

  private async resolveDriverCurrency(driverId: string): Promise<string> {
    const latest = await this.prisma.driverEarning.findFirst({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      select: { currency: true },
    });
    return latest?.currency ?? 'USD';
  }

  private mapDriverEarningsSummaryResponse(input: {
    currency: string;
    totalGross: Prisma.Decimal;
    totalPlatformFees: Prisma.Decimal;
    totalNet: Prisma.Decimal;
    pendingAmount: Prisma.Decimal;
    availableAmount: Prisma.Decimal;
    paidOutAmount: Prisma.Decimal;
    completedTripsCount: number;
    averageRating: number | null;
    ratingsCount: number;
  }): DriverEarningsSummaryResponse {
    return {
      currency: input.currency,
      totalGross: Number(input.totalGross),
      totalPlatformFees: Number(input.totalPlatformFees),
      totalNet: Number(input.totalNet),
      pendingAmount: Number(input.pendingAmount),
      availableAmount: Number(input.availableAmount),
      paidOutAmount: Number(input.paidOutAmount),
      completedTripsCount: input.completedTripsCount,
      averageRating: input.averageRating,
      ratingsCount: input.ratingsCount,
    };
  }

  private mapDriverEarningItemResponse(
    item: DriverEarningSource,
  ): DriverEarningItemResponse {
    return {
      id: item.id,
      tripId: item.tripId,
      grossAmount: Number(item.grossAmount),
      platformFeeAmount: Number(item.platformFeeAmount),
      netAmount: Number(item.netAmount),
      currency: item.currency,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      availableAt: item.availableAt ? item.availableAt.toISOString() : null,
      paidOutAt: item.paidOutAt ? item.paidOutAt.toISOString() : null,
    };
  }

  private mapDriverRatingItemResponse(
    item: DriverRatingSource,
  ): DriverRatingItemResponse {
    return {
      id: item.id,
      tripId: item.tripId,
      rating: item.rating,
      comment: item.comment,
      customerName: item.customer?.name ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private async ensureDriverProfile(userId: string): Promise<{
    id: string;
    status: DriverStatus;
    isProfileCompleted: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        driverProfile: {
          select: {
            id: true,
            status: true,
            isProfileCompleted: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Driver account not found.');
    }

    if (!user.driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    return user.driverProfile;
  }

  private flattenUploadFiles(
    files: UploadDriverVehicleDocumentsInput['files'],
  ): MulterFile[] {
    return Object.values(files ?? {}).flatMap((group) => group ?? []);
  }

  private flattenAnyUploadFiles(
    files:
      | UploadDriverVehicleDocumentsInput['files']
      | UploadDriverOnboardingDocumentsInput['files'],
  ): MulterFile[] {
    return Object.values(files ?? {}).flatMap((group) => group ?? []);
  }

  private async cleanupFiles(files: MulterFile[]): Promise<void> {
    await Promise.all(
      files.map(async (file) => unlink(file.path).catch(() => undefined)),
    );
  }

  private async cleanupStorageKeys(storageKeys: string[]): Promise<void> {
    await Promise.all(
      storageKeys.map(async (storageKey) =>
        unlink(join(process.cwd(), storageKey)).catch(() => undefined),
      ),
    );
  }

  private toVehicleResponse(
    vehicle: VehicleSource,
    documents: DocumentSource[] = [],
  ): VehicleResponseDto {
    const latestDocumentsByType = new Map<DriverDocumentType, DocumentSource>();
    for (const document of documents) {
      if (!latestDocumentsByType.has(document.type)) {
        latestDocumentsByType.set(document.type, document);
      }
    }

    const readDocumentUrl = (...types: DriverDocumentType[]): string | null => {
      for (const type of types) {
        const document = latestDocumentsByType.get(type);
        if (document) return document.url;
      }
      return null;
    };

    const workingSchedule = this.parseVehicleWorkingSchedule(
      vehicle.workingSchedule,
    );
    const completeness = this.toVehicleCompletenessResponse(vehicle, documents);

    return {
      id: vehicle.id,
      driverId: vehicle.driverId,
      vehicleType: toDriverVehicleApiType(vehicle.vehicleType),
      vehicleTypeLegacy: vehicle.vehicleType,
      brand: vehicle.make,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      licensePlateNumber: vehicle.plateNumber,
      plateNumber: vehicle.plateNumber,
      condition: vehicle.condition,
      color: vehicle.color,
      loadProfileName: vehicle.loadProfileName,
      capacityKg: vehicle.capacityKg,
      lengthCm: vehicle.lengthCm,
      widthCm: vehicle.widthCm,
      heightCm: vehicle.heightCm,
      dimensionsAreStandard: vehicle.dimensionsAreStandard,
      allowedCargoTypes: vehicle.allowedCargoTypes,
      workingSchedule,
      isDefaultLoadProfile: vehicle.isDefaultLoadProfile,
      hasTrailer: vehicle.hasTrailer,
      frontPhotoUrl: readDocumentUrl(
        DriverDocumentType.VEHICLE_FRONT_PHOTO,
        DriverDocumentType.VEHICLE_PHOTO,
      ),
      rearPhotoUrl: readDocumentUrl(DriverDocumentType.VEHICLE_REAR_PHOTO),
      sidePhotoUrl: readDocumentUrl(DriverDocumentType.VEHICLE_SIDE_PHOTO),
      licensePlatePhotoUrl: readDocumentUrl(
        DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO,
      ),
      registrationFrontDocumentUrl: readDocumentUrl(
        DriverDocumentType.VEHICLE_REGISTRATION_FRONT,
        DriverDocumentType.VEHICLE_REGISTRATION,
      ),
      registrationBackDocumentUrl: readDocumentUrl(
        DriverDocumentType.VEHICLE_REGISTRATION_BACK,
      ),
      insuranceDocumentUrl: readDocumentUrl(
        DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT,
        DriverDocumentType.VEHICLE_INSURANCE,
      ),
      insuranceExpiryDate: vehicle.insuranceExpiryDate
        ? vehicle.insuranceExpiryDate.toISOString()
        : null,
      registrationExpiryDate: vehicle.registrationExpiryDate
        ? vehicle.registrationExpiryDate.toISOString()
        : null,
      completeness,
      status: vehicle.status,
      verificationStatus: vehicle.status,
      rejectionReason: vehicle.rejectionReason,
      isActive: vehicle.isActive,
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
    };
  }

  private toVehicleCompletenessResponse(
    vehicle: VehicleSource,
    documents: DocumentSource[],
  ): DriverVehicleCompletenessResponseDto {
    const eligibleDocuments = documents.filter(
      (document) => document.status !== DocumentStatus.REJECTED,
    );
    const documentTypes = new Set(eligibleDocuments.map((document) => document.type));

    const hasBasicInfo =
      vehicle.make.trim().length > 0 &&
      vehicle.model.trim().length > 0 &&
      Number.isInteger(vehicle.year) &&
      vehicle.year >= 1980 &&
      vehicle.plateNumber.trim().length > 0;
    const hasLoadCapacityProfile = this.hasVehicleLoadCapacityProfile(vehicle);

    const hasRequiredPhotos =
      documentTypes.has(DriverDocumentType.VEHICLE_FRONT_PHOTO) &&
      documentTypes.has(DriverDocumentType.VEHICLE_REAR_PHOTO) &&
      documentTypes.has(DriverDocumentType.VEHICLE_SIDE_PHOTO) &&
      documentTypes.has(DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO);

    const hasRequiredDocuments =
      documentTypes.has(DriverDocumentType.VEHICLE_REGISTRATION_FRONT) &&
      documentTypes.has(DriverDocumentType.VEHICLE_REGISTRATION_BACK) &&
      documentTypes.has(DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT);

    const missingFields: string[] = [];
    if (!vehicle.make.trim()) missingFields.push('brand');
    if (!vehicle.model.trim()) missingFields.push('model');
    if (!Number.isInteger(vehicle.year) || vehicle.year < 1980) missingFields.push('year');
    if (!vehicle.plateNumber.trim()) missingFields.push('plateNumber');
    if (!vehicle.allowedCargoTypes.length) missingFields.push('allowedCargoTypes');
    if (!this.hasVehicleWorkingSchedule(vehicle)) missingFields.push('workingSchedule');
    if (!isCarCarrierVehicleType(vehicle.vehicleType)) {
      if (vehicle.capacityKg === null || vehicle.capacityKg <= 0) missingFields.push('maxLoadKg');
      if (vehicle.lengthCm === null || vehicle.lengthCm <= 0) missingFields.push('cargoLengthM');
      if (vehicle.widthCm === null || vehicle.widthCm <= 0) missingFields.push('cargoWidthM');
      if (vehicle.heightCm === null || vehicle.heightCm <= 0) missingFields.push('cargoHeightM');
    }
    if (!documentTypes.has(DriverDocumentType.VEHICLE_FRONT_PHOTO)) missingFields.push('frontPhoto');
    if (!documentTypes.has(DriverDocumentType.VEHICLE_REAR_PHOTO)) missingFields.push('rearPhoto');
    if (!documentTypes.has(DriverDocumentType.VEHICLE_SIDE_PHOTO)) missingFields.push('sidePhoto');
    if (!documentTypes.has(DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO)) missingFields.push('licensePlatePhoto');
    if (!documentTypes.has(DriverDocumentType.VEHICLE_REGISTRATION_FRONT)) missingFields.push('registrationFrontDocument');
    if (!documentTypes.has(DriverDocumentType.VEHICLE_REGISTRATION_BACK)) missingFields.push('registrationBackDocument');
    if (!documentTypes.has(DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT)) missingFields.push('insuranceDocument');

    return {
      hasBasicInfo,
      hasLoadCapacityProfile,
      hasRequiredPhotos,
      hasRequiredDocuments,
      isComplete:
        hasBasicInfo &&
        hasLoadCapacityProfile &&
        hasRequiredPhotos &&
        hasRequiredDocuments,
      missingFields,
    };
  }

  private hasVehicleLoadCapacityProfile(
    vehicle: Pick<
      VehicleSource,
      | 'vehicleType'
      | 'capacityKg'
      | 'lengthCm'
      | 'widthCm'
      | 'heightCm'
      | 'allowedCargoTypes'
      | 'workingSchedule'
    >,
  ): boolean {
    if (!vehicle.allowedCargoTypes.length || !this.hasVehicleWorkingSchedule(vehicle)) {
      return false;
    }

    if (isCarCarrierVehicleType(vehicle.vehicleType)) {
      return true;
    }

    return (
      vehicle.capacityKg !== null &&
      vehicle.capacityKg > 0 &&
      vehicle.lengthCm !== null &&
      vehicle.lengthCm > 0 &&
      vehicle.widthCm !== null &&
      vehicle.widthCm > 0 &&
      vehicle.heightCm !== null &&
      vehicle.heightCm > 0
    );
  }

  private hasVehicleWorkingSchedule(
    vehicle: Pick<VehicleSource, 'workingSchedule'>,
  ): boolean {
    const schedule = this.parseVehicleWorkingSchedule(vehicle.workingSchedule);
    return schedule.some(
      (day) => day.isAvailable && day.timeRanges.length > 0,
    );
  }

  private toDocumentResponse(
    document: DocumentSource,
  ): DriverDocumentResponseDto {
    return {
      id: document.id,
      vehicleId: document.vehicleId,
      type: document.type,
      url: document.url,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      status: document.status,
      rejectionReason: document.rejectionReason,
      expiresAt: document.expiresAt ? document.expiresAt.toISOString() : null,
      createdAt: document.createdAt.toISOString(),
    };
  }

  private async getDriverVehicleWithDocuments(
    driverId: string,
    vehicleId: string,
  ): Promise<VehicleSource & { documents: DocumentSource[] }> {
    const vehicle = await this.prisma.driverVehicle.findFirst({
      where: {
        id: vehicleId,
        driverId,
      },
      select: {
        ...DRIVER_VEHICLE_SELECT,
        documents: {
          orderBy: { createdAt: 'asc' },
          select: DRIVER_DOCUMENT_SELECT,
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }

    return vehicle;
  }

  private toOnboardingDocumentResponse(
    document: DocumentSource,
  ): DriverOnboardingDocumentResponseDto {
    return {
      id: document.id,
      type: document.type,
      url: document.url,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      status: document.status,
      rejectionReason: document.rejectionReason,
      expiresAt: document.expiresAt ? document.expiresAt.toISOString() : null,
      reviewedAt: document.reviewedAt
        ? document.reviewedAt.toISOString()
        : null,
      uploadedAt: document.createdAt.toISOString(),
    };
  }

  private uniqueLatestDocumentsByType(
    documents: DocumentSource[],
  ): DocumentSource[] {
    const map = new Map<DriverDocumentType, DocumentSource>();

    for (const document of documents) {
      if (!map.has(document.type)) {
        map.set(document.type, document);
      }
    }

    return [...map.values()];
  }

  private getMissingOnboardingDocuments(
    documents: DocumentSource[],
  ): DriverDocumentType[] {
    return DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES.filter(
      (requiredType) =>
        !documents.some(
          (document) =>
            document.type === requiredType &&
            document.status !== DocumentStatus.REJECTED,
        ),
    );
  }

  private hasExpiredRequiredOnboardingDocuments(
    documents: DocumentSource[],
  ): boolean {
    const now = Date.now();

    return documents.some(
      (document) =>
        DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES.includes(document.type) &&
        document.status !== DocumentStatus.REJECTED &&
        document.expiresAt !== null &&
        document.expiresAt.getTime() < now,
    );
  }

  private toOnboardingDocumentsStatusResponse(
    profile: DriverProfileSource,
    documents: DocumentSource[],
  ): DriverOnboardingDocumentsStatusResponseDto {
    const latestDocuments = this.uniqueLatestDocumentsByType(documents);
    const missingDocuments =
      this.getMissingOnboardingDocuments(latestDocuments);
    const hasExpiredRequiredDocuments =
      this.hasExpiredRequiredOnboardingDocuments(latestDocuments);
    const canSubmitForReview =
      profile.isProfileCompleted &&
      missingDocuments.length === 0 &&
      !hasExpiredRequiredDocuments &&
      profile.status !== DriverStatus.PENDING_REVIEW &&
      profile.status !== DriverStatus.APPROVED &&
      profile.status !== DriverStatus.SUSPENDED;

    return {
      onboardingStatus: profile.status,
      identityDocumentKind: profile.identityDocumentKind,
      requiredDocuments: DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES,
      uploadedDocuments: latestDocuments.map((document) =>
        this.toOnboardingDocumentResponse(document),
      ),
      missingDocuments,
      missingDocumentLabels: missingDocuments.map((documentType) =>
        this.toOnboardingDocumentLabel(documentType),
      ),
      canSubmitForReview,
      submittedForReviewAt: profile.submittedForReviewAt
        ? profile.submittedForReviewAt.toISOString()
        : null,
      nextStep: this.getOnboardingNextStep(profile),
    };
  }

  private toOnboardingDocumentLabel(type: DriverDocumentType): string {
    switch (type) {
      case DriverDocumentType.PERSONAL_SELFIE:
        return 'Personal selfie';
      case DriverDocumentType.ID_FRONT:
        return 'ID or residency card front';
      case DriverDocumentType.ID_BACK:
        return 'ID or residency card back';
      case DriverDocumentType.DRIVING_LICENSE:
        return 'Driving license';
      case DriverDocumentType.SELF_IDENTITY_VERIFICATION:
        return 'Self-identity verification';
      default:
        return type;
    }
  }

  private toDriverOfferResponse(
    offer: DriverOfferSource,
  ): DriverOfferResponseDto {
    return {
      id: offer.id,
      requestId: offer.requestId,
      driverId: offer.driverId,
      alertId: offer.alertId,
      price: Number(offer.price),
      currency: offer.currency,
      estimatedPickupAt: offer.estimatedPickupAt?.toISOString() ?? null,
      estimatedDeliveryAt: offer.estimatedDeliveryAt?.toISOString() ?? null,
      estimatedDurationMinutes: offer.estimatedDurationMinutes,
      message: offer.message,
      status: offer.status,
      expiresAt: offer.expiresAt?.toISOString() ?? null,
      acceptedAt: offer.acceptedAt?.toISOString() ?? null,
      rejectedAt: offer.rejectedAt?.toISOString() ?? null,
      cancelledAt: offer.cancelledAt?.toISOString() ?? null,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
    };
  }

  private toAcceptedJobSummaryResponse(
    request: AcceptedJobRequestSource,
  ): DriverAcceptedJobSummaryDto {
    if (!request.acceptedOffer) {
      throw new BadRequestException(
        'Accepted offer is required for accepted job response.',
      );
    }

    return {
      requestId: request.id,
      requestStatus: request.status,
      acceptedAt: request.acceptedAt ? request.acceptedAt.toISOString() : null,
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
      acceptedOffer: this.toDriverOfferResponse(request.acceptedOffer),
      nextStep: 'GO_TO_PICKUP',
    };
  }

  private toAcceptedJobDetailsResponse(
    request: AcceptedJobRequestSource,
  ): DriverAcceptedJobDetailsResponseDto {
    const summary = this.toAcceptedJobSummaryResponse(request);
    const customerFirstName = request.customer?.name
      ? (request.customer.name.trim().split(/\s+/)[0] ?? null)
      : null;

    return {
      ...summary,
      customer: {
        firstName: customerFirstName,
        phone: null,
        rating: null,
      },
      itemDetails: {
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
      },
      photos: request.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        sortOrder: photo.sortOrder,
        createdAt: photo.createdAt.toISOString(),
      })),
    };
  }

  private toProfileResponse(
    profile: DriverProfileSource,
  ): DriverProfileResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      countryCode: profile.countryCode,
      countryCodes: profile.countryCodes,
      city: profile.city,
      cities: profile.cities,
      coverageAreas: profile.coverageAreas,
      fullNameOnId: profile.fullNameOnId,
      dateOfBirth: profile.dateOfBirth
        ? profile.dateOfBirth.toISOString()
        : null,
      idOrResidencyNumberMasked: this.maskIdOrResidencyNumber(
        profile.idOrResidencyNumber,
      ),
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      postalCode: profile.postalCode,
      preferredLanguage: profile.preferredLanguage,
      emergencyContactName: profile.emergencyContactName,
      emergencyContactPhone: profile.emergencyContactPhone,
      profilePhotoUrl: profile.profilePhotoUrl,
      status: profile.status,
      isProfileCompleted: profile.isProfileCompleted,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private toDriverOnboardingResponse(
    profile: DriverProfileSource,
  ): DriverOnboardingResponseDto {
    return {
      driverId: profile.id,
      fullNameOnId: profile.fullNameOnId,
      dateOfBirth: profile.dateOfBirth
        ? profile.dateOfBirth.toISOString()
        : null,
      coverageCity: profile.city,
      coverageAreas: profile.coverageAreas,
      idOrResidencyNumberMasked: this.maskIdOrResidencyNumber(
        profile.idOrResidencyNumber,
      ),
      onboardingStatus: profile.status,
      isPersonalInfoCompleted: profile.isProfileCompleted,
      nextStep: this.getOnboardingNextStep(profile),
    };
  }

  private assertTestingModeEnabled(): void {
    const allowInProduction = process.env.ALLOW_TESTING_APPROVAL === 'true';
    if (process.env.NODE_ENV === 'production' && !allowInProduction) {
      throw new BadRequestException(
        'Testing approval is disabled in production.',
      );
    }
  }

  private toDriverMeResponse(
    user: DriverMeSource,
    availability: AvailabilitySource | null = null,
  ): DriverMeResponseDto {
    const profile = user.driverProfile;

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: 'DRIVER',
      },
      driver: this.toProfileResponse(profile),
      nextStep: this.getNextStep(profile, availability),
    };
  }
}
