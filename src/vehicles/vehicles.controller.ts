import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import {
  VehicleModelsQueryDto,
  VehicleSeriesQueryDto,
  VehicleYearsQueryDto,
} from './dto/vehicle-catalog-query.dto';
import {
  VehicleCatalogBrandDto,
  VehicleCatalogModelDto,
  VehicleCatalogSeriesDto,
  VehicleCatalogYearDto,
  VehicleVinDecodeResponseDto,
} from './dto/vehicle-response.dto';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(CustomerAuthGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get('decode-vin/:vin')
  decodeVin(
    @Param('vin') vin: string,
    @Query('swissRegistrationNumber') swissRegistrationNumber?: string,
  ): Promise<VehicleVinDecodeResponseDto> {
    return this.vehiclesService.decodeVin(vin, swissRegistrationNumber);
  }

  @Get('catalog/brands')
  listBrands(): Promise<VehicleCatalogBrandDto[]> {
    return this.vehiclesService.listBrands();
  }

  @Get('catalog/models')
  async listModels(
    @Query() query: VehicleModelsQueryDto,
  ): Promise<VehicleCatalogModelDto[]> {
    if (!query.brandId?.trim())
      throw new BadRequestException('brandId is required.');
    return this.vehiclesService.listModels(query.brandId.trim());
  }

  @Get('catalog/series')
  async listSeries(
    @Query() query: VehicleSeriesQueryDto,
  ): Promise<VehicleCatalogSeriesDto[]> {
    if (!query.modelId?.trim())
      throw new BadRequestException('modelId is required.');
    return this.vehiclesService.listSeries(query.modelId.trim());
  }

  @Get('catalog/years')
  async listYears(
    @Query() query: VehicleYearsQueryDto,
  ): Promise<VehicleCatalogYearDto[]> {
    if (!query.seriesId?.trim())
      throw new BadRequestException('seriesId is required.');
    return this.vehiclesService.listYears(query.seriesId.trim());
  }
}
