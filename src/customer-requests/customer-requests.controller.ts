import {
  Body,
  Delete,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import type { File as MulterFile } from 'multer';
import { mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import { FilesInterceptor } from '@nestjs/platform-express';

import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import {
  CustomerHomeRequestSummaryDto,
  CustomerRequestResponseDto,
  CustomerRequestStatusResponseDto,
} from './dto/customer-request-response.dto';
import { AcceptDriverOfferDto } from './dto/accept-driver-offer.dto';
import { CustomerAcceptOfferResponseDto } from './dto/customer-accept-offer-response.dto';
import { CustomerRequestOffersResponseDto } from './dto/customer-request-offers.dto';
import { SubmitCustomerRequestDto } from './dto/submit-customer-request.dto';
import { UpdateDropoffLocationDto } from './dto/update-dropoff-location.dto';
import { UpdatePickupLocationDto } from './dto/update-pickup-location.dto';
import { UpdateScheduleAndItemDetailsDto } from './dto/update-schedule-and-item-details.dto';
import { CustomerRequestsService } from './customer-requests.service';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

const MAX_PHOTOS_PER_REQUEST = 8;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Controller('customer/requests')
@UseGuards(CustomerAuthGuard)
export class CustomerRequestsController {
  constructor(
    private readonly customerRequestsService: CustomerRequestsService,
  ) {}

  @Get()
  async listCustomerRequests(
    @Req() request: AuthenticatedRequest,
  ): Promise<CustomerHomeRequestSummaryDto[]> {
    return this.customerRequestsService.listCustomerRequests({
      customerId: request.user.id,
    });
  }

  @Post()
  async createDraftRequest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateServiceRequestDto,
  ): Promise<CustomerRequestResponseDto> {
    return this.customerRequestsService.createDraftRequest({
      customerId: request.user.id,
      serviceId: dto.serviceId,
      vehicleVin: dto.vehicleVin,
      vehicleBrand: dto.vehicleBrand,
      vehicleModel: dto.vehicleModel,
      vehicleSeries: dto.vehicleSeries,
      vehicleVariant: dto.vehicleVariant,
      vehicleManufactureYear: dto.vehicleManufactureYear,
      vehicleEstimatedWeightKg: dto.vehicleEstimatedWeightKg,
      vehicleBodyType: dto.vehicleBodyType,
      vehicleDataSource: dto.vehicleDataSource,
      vehicleCondition: dto.vehicleCondition,
      vehicleConditionNotes: dto.vehicleConditionNotes,
    });
  }

  @Get(':requestId/status')
  async getRequestStatus(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<CustomerRequestStatusResponseDto> {
    return this.customerRequestsService.getCustomerRequestStatus({
      customerId: request.user.id,
      requestId,
    });
  }

  @Get(':requestId/offers')
  async getRequestOffers(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<CustomerRequestOffersResponseDto> {
    return this.customerRequestsService.getCustomerRequestOffers({
      customerId: request.user.id,
      requestId,
    });
  }

  @Patch(':requestId/pickup-location')
  async updatePickupLocation(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() dto: UpdatePickupLocationDto,
  ): Promise<CustomerRequestResponseDto> {
    return this.customerRequestsService.updatePickupLocation({
      customerId: request.user.id,
      requestId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      address: dto.address,
      placeId: dto.placeId,
    });
  }

  @Patch(':requestId/dropoff-location')
  async updateDropoffLocation(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() dto: UpdateDropoffLocationDto,
  ): Promise<CustomerRequestResponseDto> {
    return this.customerRequestsService.updateDropoffLocation({
      customerId: request.user.id,
      requestId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      address: dto.address,
      placeId: dto.placeId,
    });
  }

  @Patch(':requestId/schedule-and-item-details')
  async updateScheduleAndItemDetails(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() dto: UpdateScheduleAndItemDetailsDto,
  ): Promise<CustomerRequestResponseDto> {
    return this.customerRequestsService.updateScheduleAndItemDetails({
      customerId: request.user.id,
      requestId,
      isImmediate: dto.isImmediate,
      scheduledPickupAt: dto.scheduledPickupAt
        ? new Date(dto.scheduledPickupAt)
        : undefined,
      itemTitle: dto.itemTitle,
      itemDescription: dto.itemDescription,
      itemType: dto.itemType,
      itemBrand: dto.itemBrand,
      itemModel: dto.itemModel,
      itemYear: dto.itemYear,
      vehicleVin: dto.vehicleVin,
      vehicleBrand: dto.vehicleBrand,
      vehicleModel: dto.vehicleModel,
      vehicleSeries: dto.vehicleSeries,
      vehicleVariant: dto.vehicleVariant,
      vehicleManufactureYear: dto.vehicleManufactureYear,
      vehicleEstimatedWeightKg: dto.vehicleEstimatedWeightKg,
      vehicleBodyType: dto.vehicleBodyType,
      vehicleDataSource: dto.vehicleDataSource,
      vehicleCondition: dto.vehicleCondition,
      vehicleConditionNotes: dto.vehicleConditionNotes,
      itemCondition: dto.itemCondition,
      itemWeightKg: dto.itemWeightKg,
      itemLengthCm: dto.itemLengthCm,
      itemWidthCm: dto.itemWidthCm,
      itemHeightCm: dto.itemHeightCm,
      requiresLoadingHelp: dto.requiresLoadingHelp,
      loadingWorkersCount: dto.loadingWorkersCount,
      specialInstructions: dto.specialInstructions,
    });
  }

  @Post(':requestId/photos')
  @UseInterceptors(
    FilesInterceptor('photos', MAX_PHOTOS_PER_REQUEST, {
      storage: diskStorage({
        destination: (req, _file, callback) => {
          const requestIdValue = req.params?.requestId;
          const requestId =
            typeof requestIdValue === 'string'
              ? requestIdValue
              : 'unknown-request';
          const targetDirectory = join(
            process.cwd(),
            'uploads',
            'transport-requests',
            requestId,
          );
          mkdirSync(targetDirectory, { recursive: true });
          callback(null, targetDirectory);
        },
        filename: (_req, file, callback) => {
          const randomSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const extension =
            extname(file.originalname || '').toLowerCase() || '.jpg';
          callback(null, `photo-${randomSuffix}${extension}`);
        },
      }),
      limits: {
        fileSize: MAX_PHOTO_SIZE_BYTES,
      },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
          callback(
            new Error('Only JPEG, PNG, and WEBP images are allowed.'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadRequestPhotos(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @UploadedFiles() files: MulterFile[],
  ): Promise<{
    requestId: string;
    photos: CustomerRequestResponseDto['photos'];
  }> {
    return this.customerRequestsService.uploadRequestPhotos({
      customerId: request.user.id,
      requestId,
      files,
    });
  }

  @Delete(':requestId/photos/:photoId')
  @HttpCode(HttpStatus.OK)
  async deleteRequestPhoto(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Param('photoId') photoId: string,
  ): Promise<{
    requestId: string;
    photos: CustomerRequestResponseDto['photos'];
  }> {
    return this.customerRequestsService.deleteRequestPhoto({
      customerId: request.user.id,
      requestId,
      photoId,
    });
  }

  @Post(':requestId/submit')
  async submitRequest(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() dto: SubmitCustomerRequestDto,
  ): Promise<CustomerRequestResponseDto> {
    return this.customerRequestsService.submitCustomerRequest({
      customerId: request.user.id,
      requestId,
      customerNote: dto.customerNote,
    });
  }

  @Post(':requestId/offers/:offerId/accept')
  async acceptDriverOffer(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Param('offerId') offerId: string,
    @Body() dto: AcceptDriverOfferDto,
  ): Promise<CustomerAcceptOfferResponseDto> {
    return this.customerRequestsService.acceptDriverOffer({
      customerId: request.user.id,
      requestId,
      offerId,
      confirm: dto.confirm ?? true,
    });
  }
}
