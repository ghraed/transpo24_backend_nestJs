import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  VehicleCatalogBrandDto,
  VehicleCatalogModelDto,
  VehicleCatalogSeriesDto,
  VehicleCatalogYearDto,
  VehicleVinDecodeResponseDto,
} from './dto/vehicle-response.dto';

const DEFAULT_VPIC_BASE_URL = 'https://vpic.nhtsa.dot.gov/api';
const DEFAULT_VPIC_TIMEOUT_MS = 10000;
const FALLBACK_MESSAGE =
  'Vehicle details could not be fetched from the VIN. Please select vehicle details manually.';

interface NhtsaDecodeVinValuesExtendedResult {
  VIN?: string | null;
  Make?: string | null;
  Model?: string | null;
  ModelYear?: string | null;
  Trim?: string | null;
  VehicleType?: string | null;
  BodyClass?: string | null;
  Manufacturer?: string | null;
  PlantCountry?: string | null;
  EngineCylinders?: string | null;
  DisplacementL?: string | null;
  FuelTypePrimary?: string | null;
  TransmissionStyle?: string | null;
  DriveType?: string | null;
  Doors?: string | null;
  Series?: string | null;
  ErrorCode?: string | null;
  ErrorText?: string | null;
  CurbWeightPounds?: string | null;
  GVWR?: string | null;
  GrossVehicleWeightRatingFrom?: string | null;
}

interface NhtsaDecodeVinValuesExtendedResponse {
  Count?: number;
  Message?: string;
  SearchCriteria?: string;
  Results?: NhtsaDecodeVinValuesExtendedResult[];
}

interface DecodedVinResult {
  vin: string;
  make: string | null;
  model: string | null;
  year: string | null;
  trim: string | null;
  vehicleType: string | null;
  bodyClass: string | null;
  manufacturer: string | null;
  plantCountry: string | null;
  engineCylinders: string | null;
  displacementL: string | null;
  fuelTypePrimary: string | null;
  transmissionStyle: string | null;
  driveType: string | null;
  doors: string | null;
  series: string | null;
  errorCode: string | null;
  errorText: string | null;
  source: 'NHTSA_VPIC';
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async decodeVin(rawVin: string): Promise<VehicleVinDecodeResponseDto> {
    const vin = this.sanitizeVin(rawVin);

    try {
      const response = await fetch(this.buildDecodeVinEndpoint(vin), {
        signal: AbortSignal.timeout(this.getVpicTimeoutMs()),
      });
      if (!response.ok) {
        this.logger.warn(
          `NHTSA vPIC returned HTTP ${response.status} for VIN decode.`,
        );
        throw new ServiceUnavailableException(
          'VIN decoding service is temporarily unavailable.',
        );
      }
      const body =
        (await response.json()) as NhtsaDecodeVinValuesExtendedResponse;
      const decoded = this.normalizeNhtsaResult(vin, body.Results?.[0]);
      const manufactureYear = this.toNumber(decoded.year);
      let estimatedWeightKg = this.extractWeightKg(body.Results?.[0]);
      if (!estimatedWeightKg)
        estimatedWeightKg = await this.estimateWeightFromCatalog({
          brand: decoded.make,
          model: decoded.model,
          series: decoded.series,
          manufactureYear,
        });
      const hasUseful = Boolean(
        decoded.make ||
          decoded.model ||
          manufactureYear ||
          estimatedWeightKg ||
          decoded.bodyClass,
      );
      if (!hasUseful) return this.fallback();
      const requiresManualSelection =
        !decoded.make || !decoded.model || !manufactureYear || !estimatedWeightKg;
      const variant = decoded.trim ?? decoded.series;
      const bodyType = decoded.bodyClass;
      return {
        success: !requiresManualSelection,
        source: 'NHTSA_VPIC',
        requiresManualSelection,
        message: requiresManualSelection ? FALLBACK_MESSAGE : undefined,
        data: {
          vin,
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
          errorCode: decoded.errorCode,
          errorText: decoded.errorText,
          source: decoded.source,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `NHTSA vPIC VIN decode failed for ${this.maskVin(vin)}.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'VIN decoding service is temporarily unavailable.',
      );
    }
  }

  private sanitizeVin(rawVin: string): string {
    const vin = rawVin.trim().toUpperCase();
    if (vin.length !== 17)
      throw new BadRequestException('VIN must be exactly 17 characters long.');
    if (!/^[A-Z0-9]+$/.test(vin))
      throw new BadRequestException('VIN must contain only letters and numbers.');
    if (/[IOQ]/.test(vin))
      throw new BadRequestException('VIN cannot contain the letters I, O, or Q.');
    return vin;
  }

  private buildDecodeVinEndpoint(vin: string): string {
    const baseUrl =
      process.env.NHTSA_VPIC_BASE_URL?.trim().replace(/\/+$/, '') ||
      DEFAULT_VPIC_BASE_URL;
    return `${baseUrl}/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`;
  }

  private getVpicTimeoutMs(): number {
    const rawTimeout = process.env.NHTSA_VPIC_TIMEOUT_MS?.trim();
    const parsedTimeout = rawTimeout ? Number(rawTimeout) : NaN;
    if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0)
      return DEFAULT_VPIC_TIMEOUT_MS;
    return parsedTimeout;
  }

  private normalizeNhtsaResult(
    vin: string,
    result?: NhtsaDecodeVinValuesExtendedResult,
  ): DecodedVinResult {
    return {
      vin: this.normalizeText(result?.VIN) ?? vin,
      make: this.normalizeText(result?.Make),
      model: this.normalizeText(result?.Model),
      year: this.normalizeText(result?.ModelYear),
      trim: this.normalizeText(result?.Trim),
      vehicleType: this.normalizeText(result?.VehicleType),
      bodyClass: this.normalizeText(result?.BodyClass),
      manufacturer: this.normalizeText(result?.Manufacturer),
      plantCountry: this.normalizeText(result?.PlantCountry),
      engineCylinders: this.normalizeText(result?.EngineCylinders),
      displacementL: this.normalizeText(result?.DisplacementL),
      fuelTypePrimary: this.normalizeText(result?.FuelTypePrimary),
      transmissionStyle: this.normalizeText(result?.TransmissionStyle),
      driveType: this.normalizeText(result?.DriveType),
      doors: this.normalizeText(result?.Doors),
      series: this.normalizeText(result?.Series),
      errorCode: this.normalizeText(result?.ErrorCode),
      errorText: this.normalizeText(result?.ErrorText),
      source: 'NHTSA_VPIC',
    };
  }

  private normalizeText(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (
      !normalized ||
      normalized.toLowerCase() === 'null' ||
      normalized.toLowerCase() === 'not applicable'
    )
      return null;
    return normalized;
  }

  private toNumber(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private extractWeightKg(
    result?: NhtsaDecodeVinValuesExtendedResult,
  ): number | null {
    const candidates = [
      {
        value: this.normalizeText(result?.CurbWeightPounds),
        appearsPounds: true,
      },
      {
        value: this.normalizeText(result?.GVWR),
        appearsPounds: false,
      },
      {
        value: this.normalizeText(result?.GrossVehicleWeightRatingFrom),
        appearsPounds: false,
      },
    ];
    for (const candidate of candidates) {
      if (!candidate.value) continue;
      const numeric = candidate.value.match(/\d+(\.\d+)?/);
      if (!numeric) continue;
      const value = Number(numeric[0]);
      if (!Number.isFinite(value) || value <= 0) continue;
      const appearsPounds =
        candidate.appearsPounds ||
        candidate.value.toLowerCase().includes('lb') ||
        candidate.value.toLowerCase().includes('pound');
      return Math.round(appearsPounds ? value * 0.453592 : value);
    }
    return null;
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
      source: 'NHTSA_VPIC',
      requiresManualSelection: true,
      message: FALLBACK_MESSAGE,
      data: null,
    };
  }

  private maskVin(vin: string): string {
    if (vin.length <= 6) return vin;
    return `${vin.slice(0, 3)}********${vin.slice(-3)}`;
  }
}
