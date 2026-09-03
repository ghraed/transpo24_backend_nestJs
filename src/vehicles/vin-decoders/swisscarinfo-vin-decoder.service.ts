import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  hasUsableVehicleData,
  isExplicitNotFoundMessage,
  NormalizedVinData,
  normalizeText,
  ProviderVinDecodeResult,
} from './vin-decoder.types';

const DEFAULT_API_URL = 'https://api.swisscarinfo.ch/v3/search';
const DEFAULT_TIMEOUT_MS = 10000;
const UNAVAILABLE_MESSAGE =
  'Primary VIN decoding service is temporarily unavailable.';
const CONFIGURATION_MESSAGE =
  'VIN decoding service configuration is unavailable.';

interface SwissCarInfoRecord {
  identification?: {
    make?: unknown;
    commercial_name?: unknown;
  } | null;
  engine?: {
    displacement_cc?: unknown;
  } | null;
  fuel?: {
    type_label?: unknown;
  } | null;
  make?: unknown;
  commercial_name?: unknown;
  type?: unknown;
  variant?: unknown;
  version?: unknown;
  vehicle_identification_number?: unknown;
  date_of_manufacture_veh?: unknown;
  stage_manufacturer_name_and_adress?: unknown;
  number_of_cylinders?: unknown;
  engine_capacity?: unknown;
  fuel_code_label?: unknown;
  gearbox_type_code_label?: unknown;
  code_for_bodywork_label?: unknown;
  vehicle_category_code_label?: unknown;
  number_of_doors?: unknown;
  mass_of_the_vehicle_in_running_order?: unknown;
}

interface SwissCarInfoResponse {
  success?: unknown;
  data?: unknown;
  error?: unknown;
  message?: unknown;
}

@Injectable()
export class SwissCarInfoVinDecoder {
  private readonly logger = new Logger(SwissCarInfoVinDecoder.name);

  assertConfigured(): void {
    this.getConfiguration();
  }

  async decode(vin: string): Promise<ProviderVinDecodeResult> {
    const { apiKey, apiUrl } = this.getConfiguration();
    const endpoint = new URL(apiUrl);
    endpoint.searchParams.set('q', vin);
    endpoint.searchParams.set('type', 'vin');

    try {
      const response = await fetch(endpoint, {
        headers: { 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(this.getTimeoutMs()),
      });

      if (!response.ok) {
        this.logger.warn(
          JSON.stringify({
            event: 'vin_decode_provider_http_error',
            provider: 'swisscarinfo',
            status: response.status,
          }),
        );
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const body = (await response.json()) as SwissCarInfoResponse;
      if (body.success === false) {
        if (
          isExplicitNotFoundMessage(body.error) ||
          isExplicitNotFoundMessage(body.message)
        ) {
          return { kind: 'not-found' };
        }
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }
      if (body.success !== true || !Array.isArray(body.data)) {
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }
      if (body.data.length === 0) return { kind: 'not-found' };

      let sawStructuredRecord = false;
      for (const item of body.data) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        sawStructuredRecord = true;
        const data = this.normalize(vin, item as SwissCarInfoRecord);
        if (hasUsableVehicleData(data)) return { kind: 'found', data };
      }

      if (!sawStructuredRecord) {
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }
      return { kind: 'not-found' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        JSON.stringify({
          event: 'vin_decode_provider_request_failed',
          provider: 'swisscarinfo',
          vin: this.maskVin(vin),
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }

  private normalize(
    vin: string,
    record: SwissCarInfoRecord,
  ): NormalizedVinData {
    const manufactureDate = normalizeText(record.date_of_manufacture_veh);
    const year = manufactureDate?.match(/(?:19|20)\d{2}/)?.[0] ?? null;
    const displacementCc = this.toPositiveNumber(
      record.engine?.displacement_cc ?? record.engine_capacity,
    );

    return {
      vin: normalizeText(record.vehicle_identification_number) ?? vin,
      make:
        normalizeText(record.identification?.make) ??
        normalizeText(record.make),
      model:
        normalizeText(record.identification?.commercial_name) ??
        normalizeText(record.commercial_name),
      year,
      trim: normalizeText(record.variant) ?? normalizeText(record.version),
      vehicleType: normalizeText(record.vehicle_category_code_label),
      bodyClass: normalizeText(record.code_for_bodywork_label),
      manufacturer: normalizeText(record.stage_manufacturer_name_and_adress),
      plantCountry: null,
      engineCylinders: normalizeText(record.number_of_cylinders),
      displacementL: displacementCc
        ? this.formatNumber(displacementCc / 1000)
        : null,
      fuelTypePrimary:
        normalizeText(record.fuel?.type_label) ??
        normalizeText(record.fuel_code_label),
      transmissionStyle: normalizeText(record.gearbox_type_code_label),
      driveType: null,
      doors: normalizeText(record.number_of_doors),
      series: normalizeText(record.type),
      estimatedWeightKg: this.toPositiveNumber(
        record.mass_of_the_vehicle_in_running_order,
      ),
      source: 'swisscarinfo',
    };
  }

  private getConfiguration(): { apiKey: string; apiUrl: string } {
    const apiKey = process.env.SWISSCARINFO_API_KEY?.trim();
    const apiUrl = process.env.SWISSCARINFO_API_URL?.trim() || DEFAULT_API_URL;
    if (!apiKey) {
      this.logger.error(
        JSON.stringify({
          event: 'vin_decode_provider_configuration_error',
          provider: 'swisscarinfo',
          variable: 'SWISSCARINFO_API_KEY',
        }),
      );
      throw new ServiceUnavailableException(CONFIGURATION_MESSAGE);
    }
    this.assertHttpsUrl('SWISSCARINFO_API_URL', apiUrl);
    return { apiKey, apiUrl };
  }

  private assertHttpsUrl(name: string, value: string): void {
    try {
      if (new URL(value).protocol !== 'https:') throw new Error();
    } catch {
      this.logger.error(
        JSON.stringify({
          event: 'vin_decode_provider_configuration_error',
          provider: 'swisscarinfo',
          variable: name,
        }),
      );
      throw new ServiceUnavailableException(CONFIGURATION_MESSAGE);
    }
  }

  private getTimeoutMs(): number {
    const parsed = Number(process.env.SWISSCARINFO_TIMEOUT_MS?.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
  }

  private toPositiveNumber(value: unknown): number | null {
    const normalized = normalizeText(value)?.replace(/,/g, '');
    const parsed = normalized ? Number(normalized) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private formatNumber(value: number): string {
    return Number(value.toFixed(3)).toString();
  }

  private maskVin(vin: string): string {
    return `${vin.slice(0, 3)}********${vin.slice(-3)}`;
  }
}
