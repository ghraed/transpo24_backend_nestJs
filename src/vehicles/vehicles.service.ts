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

const DEFAULT_VEHICLE_DATABASES_BASE_URL =
  'https://api.vehicledatabases.com';
const DEFAULT_VEHICLE_DATABASES_TIMEOUT_MS = 10000;
const FALLBACK_MESSAGE =
  'Vehicle details could not be fetched from the VIN. Please select vehicle details manually.';

interface VehicleDatabasesBasicVinDecodeSection {
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  trim?: string | null;
  body_type?: string | null;
  vehicle_type?: string | null;
  doors?: string | null;
}

interface VehicleDatabasesEngineSection {
  cylinders?: string | null;
  engine_size?: string | null;
  engine_capacity?: string | null;
}

interface VehicleDatabasesManufacturerSection {
  manufacturer?: string | null;
  country?: string | null;
}

interface VehicleDatabasesTransmissionSection {
  transmission_style?: string | null;
}

interface VehicleDatabasesDrivetrainSection {
  drive_type?: string | null;
}

interface VehicleDatabasesFuelSection {
  fuel_type?: string | null;
}

interface VehicleDatabasesBasicVinDecodeData {
  intro?: VehicleDatabasesBasicVinDecodeSection | null;
  basic?: VehicleDatabasesBasicVinDecodeSection | null;
  engine?: VehicleDatabasesEngineSection | null;
  manufacturer?: VehicleDatabasesManufacturerSection | null;
  transmission?: VehicleDatabasesTransmissionSection | null;
  drivetrain?: VehicleDatabasesDrivetrainSection | null;
  fuel?: VehicleDatabasesFuelSection | null;
}

interface VehicleDatabasesBasicVinDecodeResponse {
  status?: string;
  data?: VehicleDatabasesBasicVinDecodeData | null;
  code?: number | string | null;
  message?: string | null;
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
  source: 'VEHICLE_DATABASES';
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
    const apiKey = process.env.VEHICLE_DATABASES_API_KEY?.trim();

    if (!apiKey) {
      this.logger.error('Vehicle Databases API key is not configured.');
      throw new ServiceUnavailableException(
        'VIN decoding service is temporarily unavailable.',
      );
    }

    try {
      const response = await fetch(this.buildDecodeVinEndpoint(vin), {
        headers: { 'x-authkey': apiKey },
        signal: AbortSignal.timeout(this.getVehicleDatabasesTimeoutMs()),
      });

      if (response.status === 400) return this.fallback();

      if (!response.ok) {
        this.logger.warn(
          `Vehicle Databases returned HTTP ${response.status} for VIN decode.`,
        );
        throw new ServiceUnavailableException(
          'VIN decoding service is temporarily unavailable.',
        );
      }
      const body =
        (await response.json()) as VehicleDatabasesBasicVinDecodeResponse;
      const decoded = this.normalizeVehicleDatabasesResult(vin, body);
      const manufactureYear = this.toNumber(decoded.year);
      let estimatedWeightKg: number | null = null;
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
        !decoded.make || !decoded.model || !manufactureYear;
      const variant = decoded.trim ?? decoded.series;
      const bodyType = decoded.bodyClass;
      return {
        success: !requiresManualSelection,
        source: 'VEHICLE_DATABASES',
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
        `Vehicle Databases VIN decode failed for ${this.maskVin(vin)}.`,
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
      process.env.VEHICLE_DATABASES_BASE_URL?.trim().replace(/\/+$/, '') ||
      DEFAULT_VEHICLE_DATABASES_BASE_URL;
    return `${baseUrl}/vin-decode/${encodeURIComponent(vin)}`;
  }

  private getVehicleDatabasesTimeoutMs(): number {
    const rawTimeout = process.env.VEHICLE_DATABASES_TIMEOUT_MS?.trim();
    const parsedTimeout = rawTimeout ? Number(rawTimeout) : NaN;
    if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0)
      return DEFAULT_VEHICLE_DATABASES_TIMEOUT_MS;
    return parsedTimeout;
  }

  private normalizeVehicleDatabasesResult(
    vin: string,
    response?: VehicleDatabasesBasicVinDecodeResponse,
  ): DecodedVinResult {
    const basic = response?.data?.basic;
    const intro = response?.data?.intro;
    const engine = response?.data?.engine;
    const manufacturer = response?.data?.manufacturer;
    const transmission = response?.data?.transmission;
    const drivetrain = response?.data?.drivetrain;
    const fuel = response?.data?.fuel;

    return {
      vin: this.normalizeText(intro?.vin) ?? vin,
      make: this.normalizeText(basic?.make),
      model: this.normalizeText(basic?.model),
      year: this.normalizeText(basic?.year),
      trim: this.normalizeText(basic?.trim),
      vehicleType: this.normalizeText(basic?.vehicle_type),
      bodyClass: this.normalizeText(basic?.body_type),
      manufacturer: this.normalizeText(manufacturer?.manufacturer),
      plantCountry: this.normalizeText(manufacturer?.country),
      engineCylinders: this.normalizeText(engine?.cylinders),
      displacementL: this.normalizeDisplacementL(engine),
      fuelTypePrimary: this.normalizeText(fuel?.fuel_type),
      transmissionStyle: this.normalizeText(transmission?.transmission_style),
      driveType: this.normalizeText(drivetrain?.drive_type),
      doors: this.normalizeText(basic?.doors),
      series: null,
      errorCode: this.normalizeText(
        response?.status && response.status !== 'success'
          ? String(response.code ?? '')
          : null,
      ),
      errorText:
        this.normalizeText(
          response?.status && response.status !== 'success'
            ? response.message
            : null,
        ) ?? null,
      source: 'VEHICLE_DATABASES',
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

  private normalizeDisplacementL(
    engine?: VehicleDatabasesEngineSection | null,
  ): string | null {
    const engineSize = this.normalizeText(engine?.engine_size);
    if (engineSize) return engineSize;

    const engineCapacity = this.normalizeText(engine?.engine_capacity);
    if (!engineCapacity) return null;

    const parsedCapacity = Number(engineCapacity);
    if (!Number.isFinite(parsedCapacity) || parsedCapacity <= 0)
      return engineCapacity;

    if (parsedCapacity >= 50) return (parsedCapacity / 1000).toFixed(1);
    return String(parsedCapacity);
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
      source: 'VEHICLE_DATABASES',
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
