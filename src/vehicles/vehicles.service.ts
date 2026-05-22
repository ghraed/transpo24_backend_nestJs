import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  VehicleCatalogBrandDto,
  VehicleCatalogModelDto,
  VehicleCatalogSeriesDto,
  VehicleCatalogYearDto,
  VehicleVinDecodeResponseDto,
} from './dto/vehicle-response.dto';

const VPIC_TIMEOUT_MS = 5000;
const FALLBACK_MESSAGE =
  'Vehicle details could not be fetched from the VIN. Please select vehicle details manually.';

type VpicVariable = { Variable: string; Value: string | null };
type VpicResponse = { Results?: VpicVariable[] };

@Injectable()
export class VehiclesService {
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
    const endpoint = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${encodeURIComponent(vin)}?format=json`;
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(VPIC_TIMEOUT_MS),
      });
      if (!response.ok) return this.fallback();
      const body = (await response.json()) as VpicResponse;
      const variables = body.Results ?? [];
      const brand = this.getValue(variables, 'Make');
      const model = this.getValue(variables, 'Model');
      const series = this.getValue(variables, 'Series');
      const variant = this.getValue(variables, 'Trim') ?? series;
      const bodyType = this.getValue(variables, 'Body Class');
      const manufactureYear = this.toNumber(
        this.getValue(variables, 'Model Year'),
      );
      let estimatedWeightKg = this.extractWeightKg(variables);
      if (!estimatedWeightKg)
        estimatedWeightKg = await this.estimateWeightFromCatalog({
          brand,
          model,
          series,
          manufactureYear,
        });
      const hasUseful = Boolean(
        brand || model || manufactureYear || estimatedWeightKg || bodyType,
      );
      if (!hasUseful) return this.fallback();
      const requiresManualSelection =
        !brand || !model || !manufactureYear || !estimatedWeightKg;
      return {
        success: !requiresManualSelection,
        source: 'VIN_API',
        requiresManualSelection,
        message: requiresManualSelection ? FALLBACK_MESSAGE : undefined,
        data: {
          vin,
          brand,
          model,
          series,
          variant,
          manufactureYear,
          estimatedWeightKg,
          bodyType,
        },
      };
    } catch {
      return this.fallback();
    }
  }

  private sanitizeVin(rawVin: string): string {
    const vin = rawVin.trim().toUpperCase();
    if (vin.length < 6 || vin.length > 32)
      throw new BadRequestException('VIN/chassis number length is invalid.');
    if (!/^[A-HJ-NPR-Z0-9]+$/.test(vin))
      throw new BadRequestException(
        'VIN/chassis number contains invalid characters.',
      );
    return vin;
  }

  private getValue(variables: VpicVariable[], key: string): string | null {
    const hit = variables.find(
      (entry) => entry.Variable?.toLowerCase() === key.toLowerCase(),
    );
    const value = hit?.Value?.trim();
    if (
      !value ||
      value.toLowerCase() === 'null' ||
      value.toLowerCase() === 'not applicable'
    )
      return null;
    return value;
  }

  private toNumber(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private extractWeightKg(variables: VpicVariable[]): number | null {
    const candidates = [
      this.getValue(variables, 'Curb Weight (pounds)'),
      this.getValue(variables, 'GVWR'),
      this.getValue(variables, 'Gross Vehicle Weight Rating From'),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const numeric = candidate.match(/\d+(\.\d+)?/);
      if (!numeric) continue;
      const value = Number(numeric[0]);
      if (!Number.isFinite(value) || value <= 0) continue;
      const appearsPounds =
        candidate.toLowerCase().includes('lb') ||
        candidate.toLowerCase().includes('pound');
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
      source: 'VIN_API',
      requiresManualSelection: true,
      message: FALLBACK_MESSAGE,
      data: null,
    };
  }
}
