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

const DEFAULT_API_URL =
  'https://api.oneautoapi.com/oneauto/vindecodebasic/us/v2';
const DEFAULT_TIMEOUT_MS = 10000;
const UNAVAILABLE_MESSAGE =
  'Fallback VIN decoding service is temporarily unavailable.';
const CONFIGURATION_MESSAGE =
  'VIN decoding service configuration is unavailable.';

interface OneAutoApiVehicleData {
  vehicle_identification_number?: unknown;
  model_year?: unknown;
  manufacturer_desc?: unknown;
  model_range_desc?: unknown;
  trim_desc?: unknown;
  body_type_desc?: unknown;
  vehicle_type?: unknown;
  transmission_desc?: unknown;
  drivetrain_desc?: unknown;
  engine_badged_size_litres?: unknown;
  number_cylinders?: unknown;
  fuel_type_desc?: unknown;
  number_doors?: unknown;
}

interface OneAutoApiResponse {
  success?: unknown;
  result?: { vehicle_data?: unknown } | null;
  error?: unknown;
}

@Injectable()
export class OneAutoApiVinDecoder {
  private readonly logger = new Logger(OneAutoApiVinDecoder.name);

  assertConfigured(): void {
    this.getConfiguration();
  }

  async decode(vin: string): Promise<ProviderVinDecodeResult> {
    const { apiKey, apiUrl } = this.getConfiguration();
    const endpoint = new URL(apiUrl);
    endpoint.searchParams.set('vehicle_identification_number', vin);

    try {
      const response = await fetch(endpoint, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(this.getTimeoutMs()),
      });

      if (!response.ok) {
        this.logger.warn(
          JSON.stringify({
            event: 'vin_decode_provider_http_error',
            provider: 'oneautoapi',
            status: response.status,
          }),
        );
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const body = (await response.json()) as OneAutoApiResponse;
      if (body.success === false) {
        if (isExplicitNotFoundMessage(body.error)) {
          return { kind: 'not-found' };
        }
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }
      if (body.success !== true) {
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const vehicleData = body.result?.vehicle_data;
      if (vehicleData == null) return { kind: 'not-found' };
      if (typeof vehicleData !== 'object' || Array.isArray(vehicleData)) {
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const data = this.normalize(vin, vehicleData);
      return hasUsableVehicleData(data)
        ? { kind: 'found', data }
        : { kind: 'not-found' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        JSON.stringify({
          event: 'vin_decode_provider_request_failed',
          provider: 'oneautoapi',
          vin: this.maskVin(vin),
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }

  private normalize(
    vin: string,
    data: OneAutoApiVehicleData,
  ): NormalizedVinData {
    const make = normalizeText(data.manufacturer_desc);
    const trim = normalizeText(data.trim_desc);
    return {
      vin: normalizeText(data.vehicle_identification_number) ?? vin,
      make,
      model: normalizeText(data.model_range_desc),
      year: normalizeText(data.model_year),
      trim,
      vehicleType: normalizeText(data.vehicle_type),
      bodyClass: normalizeText(data.body_type_desc),
      manufacturer: make,
      plantCountry: null,
      engineCylinders: normalizeText(data.number_cylinders),
      displacementL: normalizeText(data.engine_badged_size_litres),
      fuelTypePrimary: normalizeText(data.fuel_type_desc),
      transmissionStyle: normalizeText(data.transmission_desc),
      driveType: normalizeText(data.drivetrain_desc),
      doors: normalizeText(data.number_doors),
      series: trim,
      estimatedWeightKg: null,
      source: 'oneautoapi',
    };
  }

  private getConfiguration(): { apiKey: string; apiUrl: string } {
    const apiKey = process.env.ONEAUTOAPI_API_KEY?.trim();
    const apiUrl = process.env.ONEAUTOAPI_API_URL?.trim() || DEFAULT_API_URL;
    if (!apiKey) {
      this.logger.error(
        JSON.stringify({
          event: 'vin_decode_provider_configuration_error',
          provider: 'oneautoapi',
          variable: 'ONEAUTOAPI_API_KEY',
        }),
      );
      throw new ServiceUnavailableException(CONFIGURATION_MESSAGE);
    }
    this.assertHttpsUrl('ONEAUTOAPI_API_URL', apiUrl);
    return { apiKey, apiUrl };
  }

  private assertHttpsUrl(name: string, value: string): void {
    try {
      if (new URL(value).protocol !== 'https:') throw new Error();
    } catch {
      this.logger.error(
        JSON.stringify({
          event: 'vin_decode_provider_configuration_error',
          provider: 'oneautoapi',
          variable: name,
        }),
      );
      throw new ServiceUnavailableException(CONFIGURATION_MESSAGE);
    }
  }

  private getTimeoutMs(): number {
    const parsed = Number(process.env.ONEAUTOAPI_TIMEOUT_MS?.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
  }

  private maskVin(vin: string): string {
    return `${vin.slice(0, 3)}********${vin.slice(-3)}`;
  }
}
