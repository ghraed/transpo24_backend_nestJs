import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  VehicleCatalogBrandDto,
  VehicleCatalogModelDto,
  VehicleCatalogSeriesDto,
  VehicleCatalogYearDto,
  VehicleVinDecodeResponseDto,
} from './dto/vehicle-response.dto';
import { VinDecoderService } from './vin-decoders/vin-decoder.service';

const FALLBACK_MESSAGE =
  'Vehicle details could not be fetched from the VIN. Please select vehicle details manually.';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vinDecoder: VinDecoderService,
  ) {}

  async listBrands(): Promise<VehicleCatalogBrandDto[]> {
    return this.prisma.vehicleBrand.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
  }

  async listModels(brandId: string): Promise<VehicleCatalogModelDto[]> {
    return this.prisma.vehicleModel.findMany({
      where: { brandId, isActive: true, brand: { isActive: true } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        brandId: true,
        name: true,
        slug: true,
        bodyType: true,
      },
    });
  }

  async listSeries(modelId: string): Promise<VehicleCatalogSeriesDto[]> {
    return this.prisma.vehicleSeries.findMany({
      where: {
        modelId,
        isActive: true,
        model: { isActive: true, brand: { isActive: true } },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        modelId: true,
        name: true,
        slug: true,
        variantName: true,
        yearFrom: true,
        yearTo: true,
        estimatedWeightKg: true,
        bodyType: true,
      },
    });
  }

  async listYears(seriesId: string): Promise<VehicleCatalogYearDto[]> {
    const series = await this.prisma.vehicleSeries.findFirst({
      where: {
        id: seriesId,
        isActive: true,
        model: { isActive: true, brand: { isActive: true } },
      },
      select: { yearFrom: true, yearTo: true },
    });
    if (
      !series ||
      !series.yearFrom ||
      !series.yearTo ||
      series.yearTo < series.yearFrom
    )
      return [];
    const years: VehicleCatalogYearDto[] = [];
    for (let year = series.yearTo; year >= series.yearFrom; year -= 1)
      years.push({ year });
    return years;
  }

  async decodeVin(
    rawVin: string,
    rawSwissRegistrationNumber?: string,
  ): Promise<VehicleVinDecodeResponseDto> {
    const vin = this.sanitizeVin(rawVin);
    const swissRegistrationNumber = this.sanitizeSwissRegistrationNumber(
      rawSwissRegistrationNumber,
    );
    const result = await this.vinDecoder.decode(vin, {
      swissRegistrationNumber,
    });
    if (result.kind === 'not-found') return this.fallback();

    const decoded = result.data;
    const manufactureYear = this.toNumber(decoded.year);
    const estimatedWeightKg =
      decoded.estimatedWeightKg ??
      (await this.estimateWeightFromCatalog({
        brand: decoded.make,
        model: decoded.model,
        series: decoded.series,
        manufactureYear,
      }));
    const requiresManualSelection =
      !decoded.make || !decoded.model || !manufactureYear;
    const variant = decoded.variant ?? decoded.trim ?? decoded.series;
    const bodyType = decoded.bodyClass;

    return {
      success: !requiresManualSelection,
      source: 'VIN_API',
      requiresManualSelection,
      message: requiresManualSelection ? FALLBACK_MESSAGE : undefined,
      data: {
        vin: decoded.vin || vin,
        brand: decoded.make,
        model: decoded.model,
        series: decoded.series,
        variant,
        manufactureYear,
        estimatedWeightKg,
        bodyType,
        make: decoded.make,
        year: decoded.year,
        trim: decoded.trim,
        variantCode: decoded.variant,
        vehicleType: decoded.vehicleType,
        bodyClass: decoded.bodyClass,
        manufacturer: decoded.manufacturer,
        plantCountry: decoded.plantCountry,
        engineCylinders: decoded.engineCylinders,
        displacementL: decoded.displacementL,
        fuelTypePrimary: decoded.fuelTypePrimary,
        transmissionStyle: decoded.transmissionStyle,
        driveType: decoded.driveType,
        doors: decoded.doors,
        grossWeightKg: decoded.grossWeightKg,
        payloadKg: decoded.payloadKg,
        enginePowerKw: decoded.enginePowerKw,
        enginePowerHp: decoded.enginePowerHp,
        engineTorqueNm: decoded.engineTorqueNm,
        lengthMm: decoded.lengthMm,
        widthMm: decoded.widthMm,
        heightMm: decoded.heightMm,
        wheelbaseMm: decoded.wheelbaseMm,
        seats: decoded.seats,
        maxSpeedKmh: decoded.maxSpeedKmh,
        brakedTowingKg: decoded.brakedTowingKg,
        unbrakedTowingKg: decoded.unbrakedTowingKg,
        co2CombinedGKm: decoded.co2CombinedGKm,
        fuelConsumptionCombinedL100Km: decoded.fuelConsumptionCombinedL100Km,
        euroStandard: decoded.euroStandard,
        color: decoded.color,
        errorCode: null,
        errorText: null,
        source: decoded.source,
      },
    };
  }

  private sanitizeVin(rawVin: string): string {
    const vin = rawVin.trim().toUpperCase();
    if (vin.length !== 17)
      throw new BadRequestException('VIN must be exactly 17 characters long.');
    if (!/^[A-Z0-9]+$/.test(vin))
      throw new BadRequestException(
        'VIN must contain only letters and numbers.',
      );
    if (/[IOQ]/.test(vin))
      throw new BadRequestException(
        'VIN cannot contain the letters I, O, or Q.',
      );
    return vin;
  }

  private sanitizeSwissRegistrationNumber(
    rawValue?: string,
  ): string | undefined {
    const value = rawValue?.trim();
    if (!value) return undefined;
    if (!/^[\d.\s-]+$/.test(value)) {
      throw new BadRequestException(
        'Swiss registration number must contain only digits and separators.',
      );
    }
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 9) {
      throw new BadRequestException(
        'Swiss registration number must contain exactly 9 digits.',
      );
    }
    return digits;
  }

  private toNumber(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async estimateWeightFromCatalog(input: {
    brand: string | null;
    model: string | null;
    series: string | null;
    manufactureYear: number | null;
  }): Promise<number | null> {
    if (!input.brand || !input.model) return null;
    const brand = await this.prisma.vehicleBrand.findFirst({
      where: {
        isActive: true,
        name: { equals: input.brand, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (!brand) return null;
    const model = await this.prisma.vehicleModel.findFirst({
      where: {
        isActive: true,
        brandId: brand.id,
        name: { equals: input.model, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (!model) return null;
    const series = await this.prisma.vehicleSeries.findFirst({
      where: { isActive: true, modelId: model.id },
      orderBy: { updatedAt: 'desc' },
      select: { estimatedWeightKg: true },
    });
    return series?.estimatedWeightKg ?? null;
  }

  private fallback(): VehicleVinDecodeResponseDto {
    return {
      success: false,
      source: 'VIN_API',
      requiresManualSelection: true,
      message: FALLBACK_MESSAGE,
      data: null,
    };
  }
}
