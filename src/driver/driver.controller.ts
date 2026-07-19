import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Put,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import type { File as MulterFile } from 'multer';
import { mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';

import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { CreateDriverVehicleDto } from './dto/create-driver-vehicle.dto';
import { UpdateDriverVehicleDto } from './dto/update-driver-vehicle.dto';
import { DriverAvailabilityResponseDto } from './dto/driver-availability-response.dto';
import { DriverMeResponseDto } from './dto/driver-me-response.dto';
import {
  DriverRequestAlertActionResponseDto,
  DriverRequestAlertsResponseDto,
  DriverRequestDetailsResponseDto,
} from './dto/driver-request-alert.dto';
import {
  DriverAcceptedJobDetailsResponseDto,
  DriverAcceptedJobSummaryDto,
} from './dto/driver-accepted-job.dto';
import { SendDriverPriceOfferResponseDto } from './dto/driver-offer.dto';
import {
  DriverVehicleDocumentsResponseDto,
  VehicleResponseDto,
  DriverVehiclesListResponseDto,
} from './dto/driver-vehicle-response.dto';
import {
  DriverVehicleLoadCapacitiesListResponseDto,
  DriverVehicleLoadCapacityResponseDto,
  UpsertDriverVehicleLoadCapacityDto,
} from './dto/driver-load-capacity.dto';
import { UploadDriverVehicleDocumentsDto } from './dto/upload-driver-vehicle-documents.dto';
import { SendDriverPriceOfferDto } from './dto/send-driver-price-offer.dto';
import {
  UpdateDriverAvailabilityDto,
  UpdateDriverOnlineStatusDto,
} from './dto/update-driver-availability.dto';
import { DriverOnboardingResponseDto } from './dto/driver-onboarding-response.dto';
import {
  DriverOnboardingDocumentsStatusResponseDto,
  UploadDriverOnboardingDocumentsDto,
} from './dto/driver-onboarding-documents.dto';
import { SendTestCustomerNotificationDto } from './dto/send-test-customer-notification.dto';
import { UpsertDriverPersonalInfoDto } from './dto/upsert-driver-personal-info.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { DriverService } from './driver.service';
import { PaymentsService } from '../payments/payments.service';
import { DriverTripParamDto, PickupItemDto } from './dto/pickup-item.dto';
import { TripsGateway } from '../trips/trips.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { TripsService } from '../trips/trips.service';
import {
  DeliverItemResponse,
  PickupItemResponse,
  StartDeliveryResponse,
} from '../trips/trips.types';
import { DeliverItemDto, StartDeliveryDto } from './dto/deliver-item.dto';
import {
  DriverEarningsListQueryDto,
  DriverEarningsSummaryQueryDto,
  DriverRatingsQueryDto,
} from './dto/driver-earnings.dto';
import {
  DriverEarningItemResponse,
  DriverEarningsSummaryResponse,
  DriverRatingItemResponse,
  PaginatedResponse,
} from '../trips/trips.types';
import { CreateAdditionalChargeDto } from '../payments/dto/create-additional-charge.dto';
import { AdditionalChargeResponseDto } from '../payments/dto/request-payment.dto';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
};

type DriverDocumentUploadFields = {
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

type DriverOnboardingDocumentUploadFields = {
  personalSelfie?: MulterFile[];
  idFront?: MulterFile[];
  idBack?: MulterFile[];
  drivingLicense?: MulterFile[];
  selfIdentityVerification?: MulterFile[];
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_VEHICLE_PHOTOS = 8;
const MAX_TRIP_PROOF_PHOTOS = 8;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

@Controller(['driver', 'drive'])
@UseGuards(DriverAuthGuard)
export class DriverController {
  private readonly logger = new Logger(DriverController.name);

  constructor(
    private readonly driverService: DriverService,
    private readonly paymentsService: PaymentsService,
    private readonly tripsService: TripsService,
    private readonly tripsGateway: TripsGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('me')
  async getMe(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverMeResponseDto> {
    return this.driverService.getMe({ userId: request.user.id });
  }

  @Get('profile/onboarding')
  @Get('me/onboarding')
  async getOnboardingStatus(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverOnboardingResponseDto> {
    return this.driverService.getOnboardingStatus({
      userId: request.user.id,
    });
  }

  @Post('profile/onboarding/personal-info')
  @Patch('me/onboarding/profile')
  async upsertPersonalInfo(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpsertDriverPersonalInfoDto,
  ): Promise<DriverOnboardingResponseDto> {
    return this.driverService.upsertPersonalInfo({
      userId: request.user.id,
      fullNameOnId: dto.fullNameOnId,
      dateOfBirth: new Date(dto.dateOfBirth),
      idOrResidencyNumber: dto.idOrResidencyNumber,
      coverageCity: dto.coverageCity,
      coverageAreas: dto.coverageAreas,
    });
  }

  @Get('onboarding/documents')
  async getOnboardingDocumentsStatus(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverOnboardingDocumentsStatusResponseDto> {
    return this.driverService.getOnboardingDocumentsStatus({
      userId: request.user.id,
    });
  }

  @Post('onboarding/submit-review')
  async submitOnboardingDocumentsForReview(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverOnboardingDocumentsStatusResponseDto> {
    return this.driverService.submitOnboardingDocumentsForReview({
      userId: request.user.id,
    });
  }

  @Post('onboarding/documents')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'personalSelfie', maxCount: 1 },
        { name: 'idFront', maxCount: 1 },
        { name: 'idBack', maxCount: 1 },
        { name: 'drivingLicense', maxCount: 1 },
        { name: 'selfIdentityVerification', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (req, _file, callback) => {
            const driverIdValue = req.user?.id;
            const driverId =
              typeof driverIdValue === 'string'
                ? driverIdValue
                : 'unknown-driver';
            const targetDirectory = join(
              process.cwd(),
              'uploads',
              'drivers',
              driverId,
              'onboarding',
            );
            mkdirSync(targetDirectory, { recursive: true });
            callback(null, targetDirectory);
          },
          filename: (_req, file, callback) => {
            const randomSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const extension =
              extname(file.originalname || '').toLowerCase() || '.bin';
            callback(null, `onboarding-${randomSuffix}${extension}`);
          },
        }),
        fileFilter: (_req, file, callback) => {
          const isImage = IMAGE_MIME_TYPES.has(file.mimetype);
          const field = file.fieldname;

          if (
            field === 'personalSelfie' ||
            field === 'selfIdentityVerification'
          ) {
            if (!isImage) {
              callback(
                new BadRequestException(
                  'Personal selfie and self-identity verification files must be JPEG, PNG, or WEBP.',
                ),
                false,
              );
              return;
            }
          } else if (!isImage) {
            callback(
              new BadRequestException(
                'Onboarding documents must be JPEG, PNG, or WEBP.',
              ),
              false,
            );
            return;
          }

          callback(null, true);
        },
      },
    ),
  )
  async uploadOnboardingDocuments(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UploadDriverOnboardingDocumentsDto,
    @UploadedFiles() files: DriverOnboardingDocumentUploadFields,
  ): Promise<DriverOnboardingDocumentsStatusResponseDto> {
    const allFiles = Object.values(files ?? {}).flatMap((group) => group ?? []);
    const oversizedFile = allFiles.find((file) => file.size > MAX_IMAGE_BYTES);

    if (oversizedFile) {
      throw new BadRequestException('Image files must be 5 MB or smaller.');
    }

    return this.driverService.uploadOnboardingDocuments({
      userId: request.user.id,
      files,
      idDocumentKind: dto.idDocumentKind,
      idExpiryDate: dto.idExpiryDate ? new Date(dto.idExpiryDate) : undefined,
      drivingLicenseExpiryDate: dto.drivingLicenseExpiryDate
        ? new Date(dto.drivingLicenseExpiryDate)
        : undefined,
    });
  }

  @Patch('me/profile')
  async updateMyProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateDriverProfileDto,
  ): Promise<DriverMeResponseDto> {
    return this.driverService.updateProfile({
      userId: request.user.id,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      countryCode: dto.countryCode ?? null,
      countryCodes: dto.countryCodes ?? null,
      city: dto.city ?? null,
      cities: dto.cities ?? null,
      coverageAreas: dto.coverageAreas ?? null,
      fullNameOnId: dto.fullNameOnId ?? null,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      idOrResidencyNumber: dto.idOrResidencyNumber ?? null,
      addressLine1: dto.addressLine1 ?? null,
      addressLine2: dto.addressLine2 ?? null,
      postalCode: dto.postalCode ?? null,
      preferredLanguages: dto.preferredLanguages ?? null,
      emergencyContactName: dto.emergencyContactName ?? null,
      emergencyContactPhone: dto.emergencyContactPhone ?? null,
      profilePhotoUrl: dto.profilePhotoUrl ?? null,
    });
  }

  @Get('me/availability')
  async getMyAvailability(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverAvailabilityResponseDto> {
    return this.driverService.getAvailability({ userId: request.user.id });
  }

  @Put('me/availability')
  async updateMyAvailability(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateDriverAvailabilityDto,
  ): Promise<DriverAvailabilityResponseDto> {
    return this.driverService.updateAvailability({
      userId: request.user.id,
      timezone: dto.timezone,
      isOnline: dto.isOnline,
      serviceRadiusKm: dto.serviceRadiusKm,
      baseLatitude: dto.baseLatitude,
      baseLongitude: dto.baseLongitude,
      baseAddress: dto.baseAddress,
      acceptsImmediateRequests: dto.acceptsImmediateRequests,
      acceptsScheduledRequests: dto.acceptsScheduledRequests,
      weeklySchedule: dto.weeklySchedule,
    });
  }

  @Patch('me/availability/online-status')
  async updateMyOnlineStatus(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateDriverOnlineStatusDto,
  ): Promise<DriverAvailabilityResponseDto> {
    return this.driverService.updateOnlineStatus({
      userId: request.user.id,
      isOnline: dto.isOnline,
    });
  }

  @Patch('me/testing/approve')
  async approveMeForTesting(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverMeResponseDto> {
    return this.driverService.approveForTesting({ userId: request.user.id });
  }

  @Post('me/testing/send-customer-notification')
  async sendCustomerTestNotification(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SendTestCustomerNotificationDto,
  ): Promise<{ success: true; email: string; customerId: string }> {
    return this.driverService.sendCustomerTestNotification({
      userId: request.user.id,
      email: dto.email,
    });
  }

  @Get('requests/alerts')
  async getRequestAlerts(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverRequestAlertsResponseDto> {
    return this.driverService.getDriverRequestAlerts({
      userId: request.user.id,
    });
  }

  @Get('requests/:requestId')
  async getRequestDetails(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<DriverRequestDetailsResponseDto> {
    return this.driverService.getDriverRequestDetails({
      userId: request.user.id,
      requestId,
    });
  }

  @Patch('requests/:requestId/seen')
  async markRequestSeen(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<DriverRequestAlertActionResponseDto> {
    return this.driverService.markDriverRequestSeen({
      userId: request.user.id,
      requestId,
    });
  }

  @Post('requests/:requestId/accept-alert')
  async acceptRequestAlert(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<DriverRequestAlertActionResponseDto> {
    return this.driverService.acceptDriverRequestAlert({
      userId: request.user.id,
      requestId,
    });
  }

  @Post('requests/:requestId/ignore-alert')
  async ignoreRequestAlert(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<DriverRequestAlertActionResponseDto> {
    return this.driverService.ignoreDriverRequestAlert({
      userId: request.user.id,
      requestId,
    });
  }

  @Post('requests/:requestId/offers')
  async sendPriceOffer(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() dto: SendDriverPriceOfferDto,
  ): Promise<SendDriverPriceOfferResponseDto> {
    return this.driverService.sendDriverPriceOffer({
      userId: request.user.id,
      requestId,
      price: dto.price,
      currency: dto.currency,
      estimatedPickupAt: dto.estimatedPickupAt
        ? new Date(dto.estimatedPickupAt)
        : undefined,
      estimatedDeliveryAt: dto.estimatedDeliveryAt
        ? new Date(dto.estimatedDeliveryAt)
        : undefined,
      estimatedDurationMinutes: dto.estimatedDurationMinutes,
      message: dto.message,
    });
  }

  @Post('requests/:requestId/additional-charges')
  @UseInterceptors(
    FileInterceptor('invoice', {
      storage: diskStorage({
        destination: (req, _file, callback) => {
          const driverIdValue = req.user?.id;
          const requestIdValue = req.params?.requestId;
          const driverId =
            typeof driverIdValue === 'string'
              ? driverIdValue
              : 'unknown-driver';
          const requestId =
            typeof requestIdValue === 'string'
              ? requestIdValue
              : 'unknown-request';
          const targetDirectory = join(
            process.cwd(),
            'uploads',
            'driver-additional-charges',
            driverId,
            requestId,
          );
          mkdirSync(targetDirectory, { recursive: true });
          callback(null, targetDirectory);
        },
        filename: (_req, file, callback) => {
          const randomSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const extension =
            extname(file.originalname || '').toLowerCase() || '.bin';
          callback(null, `invoice-${randomSuffix}${extension}`);
        },
      }),
      limits: {
        fileSize: MAX_PDF_BYTES,
      },
      fileFilter: (_req, file, callback) => {
        if (!DOCUMENT_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException('Invoice must be JPEG, PNG, WEBP, or PDF.'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async createAdditionalCharge(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() dto: CreateAdditionalChargeDto,
    @UploadedFile() invoiceFile: MulterFile | undefined,
  ): Promise<AdditionalChargeResponseDto> {
    if (!invoiceFile) {
      throw new BadRequestException('invoice is required.');
    }

    const charge = await this.paymentsService.createAdditionalCharge({
      driverUserId: request.user.id,
      requestId,
      amount: dto.amount,
      currency: dto.currency,
      reason: dto.reason,
      equipmentType: dto.equipmentType,
      invoiceFile,
    });

    this.tripsGateway.emitAdditionalChargeAdded(charge.customerId, charge);
    return charge;
  }

  @Get('jobs/accepted')
  async getAcceptedJobs(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverAcceptedJobSummaryDto[]> {
    return this.driverService.getDriverAcceptedJobs({
      userId: request.user.id,
    });
  }

  @Get('jobs/:requestId')
  async getAcceptedJobDetails(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<DriverAcceptedJobDetailsResponseDto> {
    return this.driverService.getDriverAcceptedJobDetails({
      userId: request.user.id,
      requestId,
    });
  }

  @Get('me/vehicles')
  async listMyVehicles(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverVehiclesListResponseDto> {
    return this.driverService.listMyVehicles({ userId: request.user.id });
  }

  @Get('me/earnings/summary')
  async getMyEarningsSummary(
    @Req() request: AuthenticatedRequest,
    @Query() query: DriverEarningsSummaryQueryDto,
  ): Promise<DriverEarningsSummaryResponse> {
    return this.driverService.getDriverEarningsSummary({
      driverId: request.user.id,
      from: query.from,
      to: query.to,
    });
  }

  @Get('me/earnings')
  async getMyEarnings(
    @Req() request: AuthenticatedRequest,
    @Query() query: DriverEarningsListQueryDto,
  ): Promise<PaginatedResponse<DriverEarningItemResponse>> {
    return this.driverService.getDriverEarnings({
      driverId: request.user.id,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      from: query.from,
      to: query.to,
    });
  }

  @Get('me/ratings')
  async getMyRatings(
    @Req() request: AuthenticatedRequest,
    @Query() query: DriverRatingsQueryDto,
  ): Promise<PaginatedResponse<DriverRatingItemResponse>> {
    return this.driverService.getDriverRatings({
      driverId: request.user.id,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      rating: query.rating,
    });
  }

  @Post('me/stripe-connect/account')
  async createStripeConnectAccount(
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    stripeAccountId: string;
    onboardingUrl: string;
    detailsSubmitted: boolean;
    payoutsEnabled: boolean;
  }> {
    return this.paymentsService.createDriverConnectAccount({
      driverUserId: request.user.id,
    });
  }

  @Get('me/stripe-connect/status')
  async getStripeConnectStatus(@Req() request: AuthenticatedRequest): Promise<{
    stripeAccountId: string | null;
    detailsSubmitted: boolean;
    payoutsEnabled: boolean;
    accountStatus: string | null;
  }> {
    return this.paymentsService.getDriverConnectStatus({
      driverUserId: request.user.id,
    });
  }

  @Post('me/stripe-connect/sync')
  async syncStripeConnectAccount(
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    detailsSubmitted: boolean;
    payoutsEnabled: boolean;
    accountStatus: string;
  }> {
    return this.paymentsService.syncDriverConnectAccount({
      driverUserId: request.user.id,
    });
  }

  @Get('me/stripe-connect/dashboard-link')
  async getStripeConnectDashboardLink(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ url: string }> {
    return this.paymentsService.getDriverConnectDashboardLink({
      driverUserId: request.user.id,
    });
  }

  @Post('me/stripe-connect/retry-transfer/:tripId')
  async retryTransferForTrip(
    @Req() request: AuthenticatedRequest,
    @Param('tripId') tripId: string,
  ): Promise<{
    transferred: boolean;
    stripeTransferId: string | null;
    reason: string | null;
  }> {
    return this.paymentsService.retryTransferForTrip({
      driverUserId: request.user.id,
      tripId,
    });
  }

  @Post('me/vehicles')
  async createVehicle(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateDriverVehicleDto,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    return this.driverService.createVehicle({
      userId: request.user.id,
      vehicleType: dto.vehicleType,
      brand: dto.brand,
      model: dto.model,
      year: dto.year,
      licensePlateNumber: dto.licensePlateNumber,
      condition: dto.condition,
      color: dto.color,
      capacityKg: dto.capacityKg,
      lengthCm: dto.lengthCm,
      widthCm: dto.widthCm,
      heightCm: dto.heightCm,
      hasTrailer: dto.hasTrailer ?? false,
      insuranceExpiryDate: dto.insuranceExpiryDate
        ? new Date(dto.insuranceExpiryDate)
        : undefined,
      registrationExpiryDate: dto.registrationExpiryDate
        ? new Date(dto.registrationExpiryDate)
        : undefined,
    });
  }

  @Get('me/vehicles/:vehicleId')
  async getVehicle(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    return this.driverService.getVehicle({
      userId: request.user.id,
      vehicleId,
    });
  }

  @Patch('me/vehicles/:vehicleId')
  async updateVehicle(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateDriverVehicleDto,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    return this.driverService.updateVehicle({
      userId: request.user.id,
      vehicleId,
      vehicleType: dto.vehicleType,
      brand: dto.brand,
      model: dto.model,
      year: dto.year,
      licensePlateNumber: dto.licensePlateNumber,
      condition: dto.condition,
      color: dto.color,
      capacityKg: dto.capacityKg,
      lengthCm: dto.lengthCm,
      widthCm: dto.widthCm,
      heightCm: dto.heightCm,
      hasTrailer: dto.hasTrailer,
      insuranceExpiryDate: dto.insuranceExpiryDate
        ? new Date(dto.insuranceExpiryDate)
        : undefined,
      registrationExpiryDate: dto.registrationExpiryDate
        ? new Date(dto.registrationExpiryDate)
        : undefined,
    });
  }

  @Delete('me/vehicles/:vehicleId')
  async deactivateVehicle(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
  ): Promise<VehicleResponseDto> {
    return this.driverService.deactivateVehicle({
      userId: request.user.id,
      vehicleId,
    });
  }

  @Patch('me/vehicles/:vehicleId/activate')
  async activateVehicle(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
  ): Promise<VehicleResponseDto> {
    return this.driverService.activateVehicle({
      userId: request.user.id,
      vehicleId,
    });
  }

  @Patch('me/vehicles/:vehicleId/testing/approve')
  async approveVehicleForTesting(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
  ): Promise<VehicleResponseDto> {
    return this.driverService.approveVehicleForTesting({
      userId: request.user.id,
      vehicleId,
    });
  }

  @Get('me/load-capacities')
  async listVehicleLoadCapacities(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverVehicleLoadCapacitiesListResponseDto> {
    return this.driverService.listVehicleLoadCapacities({
      userId: request.user.id,
    });
  }

  @Get('me/vehicles/:vehicleId/load-capacity')
  async getVehicleLoadCapacity(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
  ): Promise<DriverVehicleLoadCapacityResponseDto> {
    return this.driverService.getVehicleLoadCapacity({
      userId: request.user.id,
      vehicleId,
    });
  }

  @Post('me/vehicles/:vehicleId/load-capacity')
  async upsertVehicleLoadCapacity(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpsertDriverVehicleLoadCapacityDto,
  ): Promise<DriverVehicleLoadCapacityResponseDto> {
    return this.driverService.upsertVehicleLoadCapacity({
      userId: request.user.id,
      vehicleId,
      name: dto.name,
      maxLoadKg: dto.maxLoadKg,
      cargoLengthM: dto.cargoLengthM,
      cargoWidthM: dto.cargoWidthM,
      cargoHeightM: dto.cargoHeightM,
      dimensionsAreStandard: dto.dimensionsAreStandard,
      allowedCargoTypes: dto.allowedCargoTypes,
      workingSchedule: dto.workingSchedule,
      isDefault: dto.isDefault,
    });
  }

  @Post('me/vehicles/:vehicleId/load-capacity/set-default')
  async setDefaultVehicleLoadCapacity(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
  ): Promise<DriverVehicleLoadCapacityResponseDto> {
    return this.driverService.setDefaultVehicleLoadCapacity({
      userId: request.user.id,
      vehicleId,
    });
  }

  @Patch('trips/:tripId/pickup-item')
  @UseInterceptors(
    FilesInterceptor('photos', MAX_TRIP_PROOF_PHOTOS, {
      storage: diskStorage({
        destination: (req, _file, callback) => {
          const driverIdValue = req.user?.id;
          const tripIdValue = req.params?.tripId;
          const driverId =
            typeof driverIdValue === 'string'
              ? driverIdValue
              : 'unknown-driver';
          const tripId =
            typeof tripIdValue === 'string' ? tripIdValue : 'unknown-trip';
          const targetDirectory = join(
            process.cwd(),
            'uploads',
            'trips',
            driverId,
            tripId,
            'pickup-proof',
          );
          mkdirSync(targetDirectory, { recursive: true });
          callback(null, targetDirectory);
        },
        filename: (_req, file, callback) => {
          const randomSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const extension =
            extname(file.originalname || '').toLowerCase() || '.jpg';
          callback(null, `pickup-proof-${randomSuffix}${extension}`);
        },
      }),
      limits: {
        fileSize: MAX_IMAGE_BYTES,
      },
      fileFilter: (_req, file, callback) => {
        if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException(
              'Pickup proof photos must be JPEG, PNG, or WEBP.',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async pickupItem(
    @Req() request: AuthenticatedRequest,
    @Param() params: DriverTripParamDto,
    @Body() dto: PickupItemDto,
    @UploadedFiles() files: MulterFile[] | undefined,
  ): Promise<PickupItemResponse> {
    const result = await this.tripsService.pickupItem({
      driverId: request.user.id,
      tripId: params.tripId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      notes: dto.notes?.trim(),
      proofImageUrl: dto.proofImageUrl?.trim(),
      proofPhotos: files ?? [],
    });

    this.tripsGateway.emitItemPickedUp(result.itemPickedUp, result.status);
    await this.notificationsService.notifyCustomerItemPickedUp({
      customerId: result.itemPickedUp.customerId,
      tripId: result.itemPickedUp.tripId,
      proofPhotoCount: result.itemPickedUp.pickupProofPhotos.length,
    });

    return result.response;
  }

  @Patch('trips/:tripId/start-delivery')
  async startDelivery(
    @Req() request: AuthenticatedRequest,
    @Param() params: DriverTripParamDto,
    @Body() _dto: StartDeliveryDto,
  ): Promise<StartDeliveryResponse> {
    const result = await this.tripsService.startDelivery({
      driverId: request.user.id,
      tripId: params.tripId,
    });

    this.tripsGateway.emitDriverStartedDelivery(
      result.startedDelivery,
      result.status,
    );

    return result.response;
  }

  @Patch('trips/:tripId/deliver-item')
  @UseInterceptors(
    FilesInterceptor('photos', MAX_TRIP_PROOF_PHOTOS, {
      storage: diskStorage({
        destination: (req, _file, callback) => {
          const driverIdValue = req.user?.id;
          const tripIdValue = req.params?.tripId;
          const driverId =
            typeof driverIdValue === 'string'
              ? driverIdValue
              : 'unknown-driver';
          const tripId =
            typeof tripIdValue === 'string' ? tripIdValue : 'unknown-trip';
          const targetDirectory = join(
            process.cwd(),
            'uploads',
            'trips',
            driverId,
            tripId,
            'delivery-proof',
          );
          mkdirSync(targetDirectory, { recursive: true });
          callback(null, targetDirectory);
        },
        filename: (_req, file, callback) => {
          const randomSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const extension =
            extname(file.originalname || '').toLowerCase() || '.jpg';
          callback(null, `delivery-proof-${randomSuffix}${extension}`);
        },
      }),
      limits: {
        fileSize: MAX_IMAGE_BYTES,
      },
      fileFilter: (_req, file, callback) => {
        if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException(
              'Delivery proof photos must be JPEG, PNG, or WEBP.',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async deliverItem(
    @Req() request: AuthenticatedRequest,
    @Param() params: DriverTripParamDto,
    @Body() dto: DeliverItemDto,
    @UploadedFiles() files: MulterFile[] | undefined,
  ): Promise<DeliverItemResponse> {
    const result = await this.tripsService.deliverItem({
      driverId: request.user.id,
      tripId: params.tripId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      notes: dto.notes?.trim(),
      proofImageUrl: dto.proofImageUrl?.trim(),
      proofPhotos: files ?? [],
    });

    this.tripsGateway.emitItemDelivered(result.delivered, result.status);
    await this.notificationsService.notifyCustomerItemDelivered({
      customerId: result.delivered.customerId,
      tripId: result.delivered.tripId,
      proofPhotoCount: result.delivered.deliveryProofPhotos.length,
    });

    // Trip payment is collected when the customer accepts the offer. Delivery
    // confirmation only needs to trigger downstream payout settlement.
    try {
      await this.paymentsService.transferDriverEarningForTrip(params.tripId);
    } catch (transferError) {
      this.logger?.warn?.(
        `Delivery confirmed for trip ${params.tripId} but driver payout transfer failed: ${
          transferError instanceof Error
            ? transferError.message
            : 'unknown error'
        }`,
      );
    }

    return result.response;
  }

  @Post('me/vehicles/:vehicleId/documents')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'driverLicenseFront', maxCount: 1 },
        { name: 'driverLicenseBack', maxCount: 1 },
        { name: 'identityDocument', maxCount: 1 },
        { name: 'frontPhoto', maxCount: 1 },
        { name: 'rearPhoto', maxCount: 1 },
        { name: 'sidePhoto', maxCount: 1 },
        { name: 'licensePlatePhoto', maxCount: 1 },
        { name: 'registrationFrontDocument', maxCount: 1 },
        { name: 'registrationBackDocument', maxCount: 1 },
        { name: 'insuranceDocument', maxCount: 1 },
        { name: 'vehicleRegistration', maxCount: 1 },
        { name: 'vehicleInsurance', maxCount: 1 },
        { name: 'vehiclePhotos', maxCount: MAX_VEHICLE_PHOTOS },
      ],
      {
        storage: diskStorage({
          destination: (req, _file, callback) => {
            const driverIdValue = req.user?.id;
            const vehicleIdValue = req.params?.vehicleId;
            const driverId =
              typeof driverIdValue === 'string'
                ? driverIdValue
                : 'unknown-driver';
            const vehicleId =
              typeof vehicleIdValue === 'string'
                ? vehicleIdValue
                : 'unknown-vehicle';
            const targetDirectory = join(
              process.cwd(),
              'uploads',
              'drivers',
              driverId,
              'vehicles',
              vehicleId,
            );
            mkdirSync(targetDirectory, { recursive: true });
            callback(null, targetDirectory);
          },
          filename: (_req, file, callback) => {
            const randomSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const extension =
              extname(file.originalname || '').toLowerCase() || '.bin';
            callback(null, `doc-${randomSuffix}${extension}`);
          },
        }),
        fileFilter: (_req, file, callback) => {
          const isImage = IMAGE_MIME_TYPES.has(file.mimetype);
          const field = file.fieldname;

          if (field === 'vehiclePhotos') {
            if (!isImage) {
              callback(
                new BadRequestException(
                  'Vehicle photos must be JPEG, PNG, or WEBP.',
                ),
                false,
              );
              return;
            }
          } else if (!isImage) {
            callback(
              new BadRequestException('Documents must be JPEG, PNG, or WEBP.'),
              false,
            );
            return;
          }

          callback(null, true);
        },
      },
    ),
  )
  async uploadVehicleDocuments(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UploadDriverVehicleDocumentsDto,
    @UploadedFiles() files: DriverDocumentUploadFields,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    const allFiles = Object.values(files ?? {}).flatMap((group) => group ?? []);
    const oversizedFile = allFiles.find((file) => file.size > MAX_IMAGE_BYTES);

    if (oversizedFile) {
      throw new BadRequestException('Image files must be 5 MB or smaller.');
    }

    return this.driverService.uploadVehicleDocuments({
      userId: request.user.id,
      vehicleId,
      insuranceExpiryDate: dto.insuranceExpiryDate
        ? new Date(dto.insuranceExpiryDate)
        : undefined,
      registrationExpiryDate: dto.registrationExpiryDate
        ? new Date(dto.registrationExpiryDate)
        : undefined,
      files,
    });
  }
}
