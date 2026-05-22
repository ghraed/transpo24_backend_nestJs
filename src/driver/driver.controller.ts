import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Put,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import type { File as MulterFile } from 'multer';
import { mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';

import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { CreateDriverVehicleDto } from './dto/create-driver-vehicle.dto';
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
  DriverVehiclesListResponseDto,
} from './dto/driver-vehicle-response.dto';
import { SendDriverPriceOfferDto } from './dto/send-driver-price-offer.dto';
import {
  UpdateDriverAvailabilityDto,
  UpdateDriverOnlineStatusDto,
} from './dto/update-driver-availability.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { DriverService } from './driver.service';
import { DriverTripParamDto, PickupItemDto } from './dto/pickup-item.dto';
import { TripsGateway } from '../trips/trips.gateway';
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

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
};

type DriverDocumentUploadFields = {
  driverLicenseFront?: MulterFile[];
  driverLicenseBack?: MulterFile[];
  identityDocument?: MulterFile[];
  vehicleRegistration?: MulterFile[];
  vehicleInsurance?: MulterFile[];
  vehiclePhotos?: MulterFile[];
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_VEHICLE_PHOTOS = 8;
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
  constructor(
    private readonly driverService: DriverService,
    private readonly tripsService: TripsService,
    private readonly tripsGateway: TripsGateway,
  ) {}

  @Get('me')
  async getMe(
    @Req() request: AuthenticatedRequest,
  ): Promise<DriverMeResponseDto> {
    return this.driverService.getMe({ userId: request.user.id });
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
      countryCode: dto.countryCode,
      city: dto.city,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      addressLine1: dto.addressLine1,
      addressLine2: dto.addressLine2,
      postalCode: dto.postalCode,
      preferredLanguage: dto.preferredLanguage,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
      profilePhotoUrl: dto.profilePhotoUrl,
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

  @Post('me/vehicles')
  async createVehicle(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateDriverVehicleDto,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    return this.driverService.createVehicle({
      userId: request.user.id,
      vehicleType: dto.vehicleType,
      make: dto.make,
      model: dto.model,
      year: dto.year,
      plateNumber: dto.plateNumber,
      color: dto.color,
      capacityKg: dto.capacityKg,
      lengthCm: dto.lengthCm,
      widthCm: dto.widthCm,
      heightCm: dto.heightCm,
      hasTrailer: dto.hasTrailer,
    });
  }

  @Patch('trips/:tripId/pickup-item')
  async pickupItem(
    @Req() request: AuthenticatedRequest,
    @Param() params: DriverTripParamDto,
    @Body() dto: PickupItemDto,
  ): Promise<PickupItemResponse> {
    const result = await this.tripsService.pickupItem({
      driverId: request.user.id,
      tripId: params.tripId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      notes: dto.notes?.trim(),
      proofImageUrl: dto.proofImageUrl?.trim(),
    });

    this.tripsGateway.emitItemPickedUp(result.itemPickedUp, result.status);

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
  async deliverItem(
    @Req() request: AuthenticatedRequest,
    @Param() params: DriverTripParamDto,
    @Body() dto: DeliverItemDto,
  ): Promise<DeliverItemResponse> {
    const result = await this.tripsService.deliverItem({
      driverId: request.user.id,
      tripId: params.tripId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      notes: dto.notes?.trim(),
      proofImageUrl: dto.proofImageUrl?.trim(),
    });

    this.tripsGateway.emitItemDelivered(result.delivered, result.status);

    return result.response;
  }

  @Post('me/vehicles/:vehicleId/documents')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'driverLicenseFront', maxCount: 1 },
        { name: 'driverLicenseBack', maxCount: 1 },
        { name: 'identityDocument', maxCount: 1 },
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
          const isDocument = DOCUMENT_MIME_TYPES.has(file.mimetype);
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
          } else if (!isDocument) {
            callback(
              new BadRequestException(
                'Documents must be JPEG, PNG, WEBP, or PDF.',
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
  async uploadVehicleDocuments(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
    @UploadedFiles() files: DriverDocumentUploadFields,
  ): Promise<DriverVehicleDocumentsResponseDto> {
    const allFiles = Object.values(files ?? {}).flatMap((group) => group ?? []);
    const oversizedFile = allFiles.find((file) => {
      if (file.mimetype === 'application/pdf') {
        return file.size > MAX_PDF_BYTES;
      }
      return file.size > MAX_IMAGE_BYTES;
    });

    if (oversizedFile) {
      throw new BadRequestException(
        oversizedFile.mimetype === 'application/pdf'
          ? 'PDF documents must be 10 MB or smaller.'
          : 'Image files must be 5 MB or smaller.',
      );
    }

    return this.driverService.uploadVehicleDocuments({
      userId: request.user.id,
      vehicleId,
      files,
    });
  }
}
