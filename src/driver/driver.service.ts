import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DayOfWeek,
  DriverEarningStatus,
  DriverOfferStatus,
  DriverRequestAlertStatus,
  DriverDocumentType,
  DriverStatus,
  ItemType,
  TransportRequestStatus,
  ServiceKey,
  PreferredLanguage,
  Prisma,
  UserRole,
  VehicleCondition,
  VehicleType,
} from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { relative } from 'node:path';
import type { File as MulterFile } from 'multer';

import { PrismaService } from '../prisma/prisma.service';
import { DriverAvailabilityDayDto } from './dto/update-driver-availability.dto';
import { DriverAvailabilityResponseDto } from './dto/driver-availability-response.dto';
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
  DriverVehicleDocumentsResponseDto,
  DriverVehiclesListResponseDto,
  VehicleResponseDto,
} from './dto/driver-vehicle-response.dto';
import {
  DriverEarningItemResponse,
  DriverEarningsListInput,
  DriverEarningsSummaryInput,
  DriverEarningsSummaryResponse,
  DriverRatingItemResponse,
  DriverRatingsListInput,
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
  countryCode?: string;
  city?: string;
  dateOfBirth?: Date;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  preferredLanguage?: PreferredLanguage;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  profilePhotoUrl?: string;
}

interface CreateDriverVehicleInput {
  userId: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  color?: string;
  capacityKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  hasTrailer: boolean;
}

interface ListDriverVehiclesInput {
  userId: string;
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
  files: {
    driverLicenseFront?: MulterFile[];
    driverLicenseBack?: MulterFile[];
    identityDocument?: MulterFile[];
    vehicleRegistration?: MulterFile[];
    vehicleInsurance?: MulterFile[];
    vehiclePhotos?: MulterFile[];
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
  city: string | null;
  dateOfBirth: Date | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  preferredLanguage: PreferredLanguage | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  profilePhotoUrl: string | null;
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
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  color: string | null;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  hasTrailer: boolean;
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
  status: TransportRequestStatus;
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
      city: true,
      dateOfBirth: true,
      addressLine1: true,
      addressLine2: true,
      postalCode: true,
      preferredLanguage: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      profilePhotoUrl: true,
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
  make: true,
  model: true,
  year: true,
  plateNumber: true,
  color: true,
  capacityKg: true,
  lengthCm: true,
  widthCm: true,
  heightCm: true,
  hasTrailer: true,
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

const REQUIRED_DOCUMENT_FIELDS: Array<
  keyof UploadDriverVehicleDocumentsInput['files']
> = [
  'driverLicenseFront',
  'driverLicenseBack',
  'identityDocument',
  'vehicleRegistration',
  'vehicleInsurance',
];

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

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(input: GetDriverMeInput): Promise<DriverMeResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user || user.role !== UserRole.DRIVER) {
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

  async updateProfile(
    input: UpdateDriverProfileInput,
  ): Promise<DriverMeResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user || user.role !== UserRole.DRIVER) {
      throw new NotFoundException('Driver account not found.');
    }

    const existingProfile = user.driverProfile;

    if (!existingProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (input.dateOfBirth) {
      const adulthoodDate = new Date(input.dateOfBirth);
      adulthoodDate.setFullYear(adulthoodDate.getFullYear() + 18);

      if (adulthoodDate.getTime() > Date.now()) {
        throw new BadRequestException('Driver must be at least 18 years old.');
      }
    }

    const normalizedPhone = input.phone.trim();
    const existingPhone = await this.prisma.driverProfile.findUnique({
      where: { phone: normalizedPhone },
      select: { userId: true },
    });

    if (existingPhone && existingPhone.userId !== input.userId) {
      throw new ConflictException('Phone is already in use.');
    }

    const requiredCountryCode = input.countryCode?.trim() ?? null;
    const requiredCity = input.city?.trim() ?? null;

    const isProfileCompleted =
      input.firstName.trim().length > 0 &&
      input.lastName.trim().length > 0 &&
      normalizedPhone.length > 0 &&
      (requiredCountryCode?.length ?? 0) > 0 &&
      (requiredCity?.length ?? 0) > 0;

    const nextStatus = this.resolveNextStatus(
      existingProfile.status,
      isProfileCompleted,
    );

    const updatedProfile = await this.prisma.driverProfile.update({
      where: { userId: input.userId },
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: normalizedPhone,
        countryCode: requiredCountryCode,
        city: requiredCity,
        dateOfBirth: input.dateOfBirth ?? null,
        addressLine1: input.addressLine1?.trim() || null,
        addressLine2: input.addressLine2?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
        preferredLanguage: input.preferredLanguage ?? null,
        emergencyContactName: input.emergencyContactName?.trim() || null,
        emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
        profilePhotoUrl: input.profilePhotoUrl?.trim() || null,
        isProfileCompleted,
        status: nextStatus,
      },
      select: DRIVER_ME_SELECT.driverProfile.select,
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

    const hasVehicleDocs = await this.hasVehicleWithRequiredDocuments(
      profile.id,
    );
    this.ensureDriverCanGoOnline(
      profile.status,
      hasVehicleDocs,
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
    const allowInProduction = process.env.ALLOW_TESTING_APPROVAL === 'true';
    if (process.env.NODE_ENV === 'production' && !allowInProduction) {
      throw new BadRequestException(
        'Testing approval is disabled in production.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: DRIVER_ME_SELECT,
    });

    if (!user || user.role !== UserRole.DRIVER) {
      throw new NotFoundException('Driver account not found.');
    }

    if (!user.driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    await this.prisma.driverProfile.update({
      where: { id: user.driverProfile.id },
      data: {
        status: DriverStatus.APPROVED,
      },
    });

    return this.getMe({ userId: input.userId });
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

    const vehicleTypes = await this.getDriverVehicleTypes(profile.id);
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
        !this.isServiceCompatibleWithDriverVehicles(
          request.service.key,
          vehicleTypes,
        )
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

    if (request.status !== TransportRequestStatus.PENDING_QUOTES) {
      throw new BadRequestException(
        'Request is no longer available for quotes.',
      );
    }

    const vehicleTypes = await this.getDriverVehicleTypes(profile.id);
    if (
      !request.service ||
      !this.isServiceCompatibleWithDriverVehicles(
        request.service.key,
        vehicleTypes,
      )
    ) {
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
      throw new NotFoundException('Request not available for this driver.');
    }

    const alert = await this.ensureDriverRequestAlert({
      requestId: request.id,
      driverId: profile.id,
    });

    if (
      alert.status === DriverRequestAlertStatus.IGNORED ||
      alert.status === DriverRequestAlertStatus.EXPIRED
    ) {
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

    return this.toRequestDetailsResponse(request, seenAlert, distanceKm);
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

      const vehicleTypes = await this.getDriverVehicleTypesTx(tx, profile.id);
      if (
        !request.service ||
        !this.isServiceCompatibleWithDriverVehicles(
          request.service.key,
          vehicleTypes,
        )
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

      // TODO: emit customer.offer.received notification event when notifications/socket module is available.
      return {
        createdOffer,
        updatedRequest,
      };
    });

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
        vehicle: this.toVehicleResponse(vehicle),
        documents: vehicle.documents.map((document) =>
          this.toDocumentResponse(document),
        ),
      })),
    };
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

    return this.toAcceptedJobDetailsResponse(
      request as AcceptedJobRequestSource,
    );
  }

  async createVehicle(
    input: CreateDriverVehicleInput,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    const profile = await this.ensureDriverProfile(input.userId);

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

    const plateNumber = input.plateNumber.trim();

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
        vehicleType: input.vehicleType,
        make: input.make.trim(),
        model: input.model.trim(),
        year: input.year,
        plateNumber,
        color: input.color?.trim() || null,
        capacityKg: input.capacityKg ?? null,
        lengthCm: input.lengthCm ?? null,
        widthCm: input.widthCm ?? null,
        heightCm: input.heightCm ?? null,
        hasTrailer: input.hasTrailer,
        isActive: true,
      },
      select: DRIVER_VEHICLE_SELECT,
    });

    return {
      vehicle: this.toVehicleResponse(vehicle),
      documents: [],
      nextStep: 'ADD_VEHICLE_DOCUMENTS',
    };
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
      select: DRIVER_VEHICLE_SELECT,
    });

    if (!vehicle) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw new NotFoundException('Vehicle not found.');
    }

    const driverFiles = input.files;

    for (const field of REQUIRED_DOCUMENT_FIELDS) {
      const uploaded = driverFiles[field];
      if (!uploaded || uploaded.length === 0) {
        await this.cleanupFiles(this.flattenUploadFiles(input.files));
        throw new BadRequestException(`${field} is required.`);
      }
    }

    const vehiclePhotos = driverFiles.vehiclePhotos ?? [];
    if (vehiclePhotos.length === 0) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw new BadRequestException('At least one vehicle photo is required.');
    }

    if (vehiclePhotos.length > MAX_VEHICLE_PHOTOS) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw new BadRequestException(
        `vehiclePhotos can include at most ${MAX_VEHICLE_PHOTOS} files.`,
      );
    }

    const existingVehiclePhotosCount = await this.prisma.driverDocument.count({
      where: {
        driverId: profile.id,
        vehicleId: vehicle.id,
        type: DriverDocumentType.VEHICLE_PHOTO,
      },
    });

    if (
      existingVehiclePhotosCount + vehiclePhotos.length >
      MAX_VEHICLE_PHOTOS
    ) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw new BadRequestException(
        `A vehicle can have up to ${MAX_VEHICLE_PHOTOS} photos.`,
      );
    }

    const documentRows = this.buildDocumentRows(
      profile.id,
      vehicle.id,
      driverFiles,
    );

    try {
      await this.prisma.driverDocument.createMany({
        data: documentRows,
      });
    } catch (error) {
      await this.cleanupFiles(this.flattenUploadFiles(input.files));
      throw error;
    }

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
      vehicle: this.toVehicleResponse(vehicle),
      documents: documents.map((document) => this.toDocumentResponse(document)),
      nextStep: hasRequired ? 'SET_AVAILABILITY' : 'ADD_VEHICLE_DOCUMENTS',
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

    if (status === DriverStatus.APPROVED) {
      return 'HOME';
    }

    if (status === DriverStatus.PENDING_REVIEW) {
      return 'WAITING_APPROVAL';
    }

    const hasVehicleWithRequiredDocuments = vehicles.some((vehicle) =>
      this.hasRequiredVehicleDocuments(vehicle.documents),
    );

    if (!hasVehicleWithRequiredDocuments) {
      return 'ADD_VEHICLE_DOCUMENTS';
    }

    return 'SET_AVAILABILITY';
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
    documents: Array<{ type: DriverDocumentType }>,
  ): boolean {
    const hasLicenseFront = documents.some(
      (doc) => doc.type === DriverDocumentType.DRIVER_LICENSE_FRONT,
    );
    const hasLicenseBack = documents.some(
      (doc) => doc.type === DriverDocumentType.DRIVER_LICENSE_BACK,
    );
    const hasIdentity = documents.some(
      (doc) =>
        doc.type === DriverDocumentType.IDENTITY_DOCUMENT ||
        doc.type === DriverDocumentType.PASSPORT,
    );
    const hasVehicleRegistration = documents.some(
      (doc) => doc.type === DriverDocumentType.VEHICLE_REGISTRATION,
    );
    const hasVehicleInsurance = documents.some(
      (doc) => doc.type === DriverDocumentType.VEHICLE_INSURANCE,
    );
    const hasVehiclePhoto = documents.some(
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
    }> = [];

    const mapSingle = (
      fieldFiles: MulterFile[] | undefined,
      type: DriverDocumentType,
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
      });
    };

    mapSingle(
      files.driverLicenseFront,
      DriverDocumentType.DRIVER_LICENSE_FRONT,
    );
    mapSingle(files.driverLicenseBack, DriverDocumentType.DRIVER_LICENSE_BACK);
    mapSingle(files.identityDocument, DriverDocumentType.IDENTITY_DOCUMENT);
    mapSingle(
      files.vehicleRegistration,
      DriverDocumentType.VEHICLE_REGISTRATION,
    );
    mapSingle(files.vehicleInsurance, DriverDocumentType.VEHICLE_INSURANCE);

    for (const file of files.vehiclePhotos ?? []) {
      const storageKey = relative(process.cwd(), file.path).replace(/\\/g, '/');
      rows.push({
        driverId,
        vehicleId,
        type: DriverDocumentType.VEHICLE_PHOTO,
        url: `/${storageKey}`,
        storageKey,
        originalName: file.originalname || null,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: DocumentStatus.PENDING_REVIEW,
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

  private async getDriverVehicleTypes(
    driverId: string,
  ): Promise<Set<VehicleType>> {
    const vehicles = await this.prisma.driverVehicle.findMany({
      where: {
        driverId,
        isActive: true,
      },
      select: {
        vehicleType: true,
      },
    });

    if (vehicles.length === 0) {
      throw new BadRequestException('At least one active vehicle is required.');
    }

    return new Set(vehicles.map((vehicle) => vehicle.vehicleType));
  }

  private async getDriverVehicleTypesTx(
    tx: Prisma.TransactionClient,
    driverId: string,
  ): Promise<Set<VehicleType>> {
    const vehicles = await tx.driverVehicle.findMany({
      where: {
        driverId,
        isActive: true,
      },
      select: {
        vehicleType: true,
      },
    });

    if (vehicles.length === 0) {
      throw new BadRequestException('At least one active vehicle is required.');
    }

    return new Set(vehicles.map((vehicle) => vehicle.vehicleType));
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
      VEHICLE_TRANSPORT: ['CAR_CARRIER', 'FLATBED_TRUCK', 'TOW_TRUCK'],
      MOTORCYCLE_TRANSPORT: ['MOTORCYCLE_TRAILER', 'VAN', 'PICKUP_TRUCK'],
      GOODS_TRANSPORT: ['VAN', 'BOX_TRUCK', 'PICKUP_TRUCK'],
      FURNITURE_TRANSPORT: ['FURNITURE_TRUCK', 'BOX_TRUCK', 'VAN'],
    };

    const allowedTypes = serviceVehicleTypeMap[serviceKey];
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
  ): DriverRequestDetailsResponseDto {
    const summary = this.toRequestAlertSummary(request, alert, distanceKm);
    const customerFirstName = request.customer?.name
      ? (request.customer.name.trim().split(/\s+/)[0] ?? null)
      : null;

    return {
      ...summary,
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
    const hasRequiredDocuments =
      await this.hasVehicleWithRequiredDocuments(driverId);
    if (!hasRequiredDocuments) {
      throw new BadRequestException(
        'Vehicle and required documents must be completed before setting availability.',
      );
    }
  }

  private async hasVehicleWithRequiredDocuments(
    driverId: string,
  ): Promise<boolean> {
    const vehicles = await this.prisma.driverVehicle.findMany({
      where: {
        driverId,
        isActive: true,
      },
      select: {
        id: true,
        documents: {
          select: {
            type: true,
            status: true,
          },
        },
      },
    });

    return vehicles.some((vehicle) =>
      this.hasRequiredVehicleDocuments(
        vehicle.documents.filter(
          (document) => document.status !== DocumentStatus.REJECTED,
        ),
      ),
    );
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
    hasVehicleWithRequiredDocuments: boolean,
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

    if (!hasVehicleWithRequiredDocuments) {
      throw new BadRequestException(
        'At least one active vehicle with required documents is needed to go online.',
      );
    }

    if (status !== DriverStatus.APPROVED) {
      throw new BadRequestException(
        'Driver must be approved before going online.',
      );
    }
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
        role: true,
        driverProfile: {
          select: {
            id: true,
            status: true,
            isProfileCompleted: true,
          },
        },
      },
    });

    if (!user || user.role !== UserRole.DRIVER) {
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

  private async cleanupFiles(files: MulterFile[]): Promise<void> {
    await Promise.all(
      files.map(async (file) => unlink(file.path).catch(() => undefined)),
    );
  }

  private toVehicleResponse(vehicle: VehicleSource): VehicleResponseDto {
    return {
      id: vehicle.id,
      vehicleType: vehicle.vehicleType,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      plateNumber: vehicle.plateNumber,
      color: vehicle.color,
      capacityKg: vehicle.capacityKg,
      lengthCm: vehicle.lengthCm,
      widthCm: vehicle.widthCm,
      heightCm: vehicle.heightCm,
      hasTrailer: vehicle.hasTrailer,
      isActive: vehicle.isActive,
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
    };
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
      city: profile.city,
      dateOfBirth: profile.dateOfBirth
        ? profile.dateOfBirth.toISOString()
        : null,
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
