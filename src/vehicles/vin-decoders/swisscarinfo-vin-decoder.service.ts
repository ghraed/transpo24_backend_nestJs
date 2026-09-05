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
const MIN_SPECIFIC_VIN_CHARACTERS = 6;

interface SwissCarInfoRecord {
  identification?: {
    make?: unknown;
    commercial_name?: unknown;
    type?: unknown;
    variant?: unknown;
    version?: unknown;
    date_of_manufacture?: unknown;
    ch_identification_number?: unknown;
    vin_prefix?: unknown;
    vehicle_category_label?: unknown;
  } | null;
  plate?: {
    first_registration?: unknown;
  } | null;
  manufacturer?: {
    name?: unknown;
    country?: unknown;
  } | null;
  engine?: {
    cylinders?: unknown;
    displacement_cc?: unknown;
    power_kw?: unknown;
    power_hp?: unknown;
    max_torque_nm?: unknown;
  } | null;
  fuel?: {
    type_label?: unknown;
  } | null;
  dimensions?: {
    length_mm?: unknown;
    width_mm?: unknown;
    height_mm?: unknown;
    wheelbase_mm?: unknown;
  } | null;
  masses?: {
    curb_weight_kg?: unknown;
    gross_weight_kg?: unknown;
    payload_kg?: unknown;
  } | null;
  towing?: {
    braked_kg?: unknown;
    braked_auto_kg?: unknown;
    unbraked_kg?: unknown;
    unbraked_auto_kg?: unknown;
  } | null;
  transmission?: {
    gearbox_detail_label?: unknown;
    gearbox_type?: unknown;
    drive_type_label?: unknown;
    drive_type?: unknown;
    max_speed_kmh?: unknown;
    max_speed_auto_kmh?: unknown;
  } | null;
  body?: {
    type_label?: unknown;
    doors?: unknown;
    seats?: unknown;
    color_label?: unknown;
    color?: unknown;
  } | null;
  emissions?: {
    euro_standard_short_label?: unknown;
    euro_standard_short?: unknown;
  } | null;
  consumption_wltp?: {
    co2_combined_gkm?: unknown;
    fuel_combined_l100km?: unknown;
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
    return this.search(vin, vin, 'vin');
  }

  async decodeRegistrationNumber(
    vin: string,
    registrationNumber: string,
  ): Promise<ProviderVinDecodeResult> {
    return this.search(vin, registrationNumber, 'matricule');
  }

  private async search(
    vin: string,
    query: string,
    type: 'vin' | 'matricule',
  ): Promise<ProviderVinDecodeResult> {
    const { apiKey, apiUrl } = this.getConfiguration();
    const endpoint = new URL(apiUrl);
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('type', type);
    if (type === 'vin') endpoint.searchParams.set('limit', '100');

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

      const records = body.data.filter(
        (item): item is SwissCarInfoRecord =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      );
      if (records.length === 0) {
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const candidates = records
        .map((record) => ({
          record,
          specificity: this.getVinMatchSpecificity(vin, record),
        }))
        .filter(({ specificity }) => specificity >= MIN_SPECIFIC_VIN_CHARACTERS)
        .sort((a, b) => b.specificity - a.specificity);

      const bestSpecificity = candidates[0]?.specificity;
      const bestCandidates = candidates.filter(
        ({ specificity }) => specificity === bestSpecificity,
      );
      if (type === 'vin' && bestCandidates.length !== 1) {
        return { kind: 'not-found' };
      }

      for (const { record } of bestCandidates) {
        const data = this.normalize(vin, record);
        if (hasUsableVehicleData(data)) return { kind: 'found', data };
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
    const manufactureDate = normalizeText(
      record.identification?.date_of_manufacture ??
        record.plate?.first_registration ??
        record.date_of_manufacture_veh,
    );
    const year = manufactureDate?.match(/(?:19|20)\d{2}/)?.[0] ?? null;
    const displacementCc = this.toPositiveNumber(
      record.engine?.displacement_cc ?? record.engine_capacity,
    );

    return {
      vin:
        normalizeText(record.identification?.ch_identification_number) ??
        normalizeText(record.vehicle_identification_number) ??
        vin,
      make:
        normalizeText(record.identification?.make) ??
        normalizeText(record.make),
      model:
        normalizeText(record.identification?.commercial_name) ??
        normalizeText(record.commercial_name),
      year,
      trim:
        normalizeText(record.identification?.version) ??
        normalizeText(record.version) ??
        normalizeText(record.identification?.variant) ??
        normalizeText(record.variant),
      variant:
        normalizeText(record.identification?.variant) ??
        normalizeText(record.variant),
      vehicleType:
        normalizeText(record.identification?.vehicle_category_label) ??
        normalizeText(record.vehicle_category_code_label),
      bodyClass:
        normalizeText(record.body?.type_label) ??
        normalizeText(record.code_for_bodywork_label),
      manufacturer:
        normalizeText(record.manufacturer?.name) ??
        normalizeText(record.stage_manufacturer_name_and_adress),
      plantCountry: normalizeText(record.manufacturer?.country),
      engineCylinders:
        normalizeText(record.engine?.cylinders) ??
        normalizeText(record.number_of_cylinders),
      displacementL: displacementCc
        ? this.formatNumber(displacementCc / 1000)
        : null,
      fuelTypePrimary:
        normalizeText(record.fuel?.type_label) ??
        normalizeText(record.fuel_code_label),
      transmissionStyle:
        normalizeText(record.transmission?.gearbox_detail_label) ??
        normalizeText(record.transmission?.gearbox_type) ??
        normalizeText(record.gearbox_type_code_label),
      driveType:
        normalizeText(record.transmission?.drive_type_label) ??
        normalizeText(record.transmission?.drive_type),
      doors:
        normalizeText(record.body?.doors) ??
        normalizeText(record.number_of_doors),
      series:
        normalizeText(record.identification?.type) ??
        normalizeText(record.type),
      estimatedWeightKg: this.toPositiveNumber(
        record.masses?.curb_weight_kg ??
          record.mass_of_the_vehicle_in_running_order,
      ),
      grossWeightKg: this.toPositiveNumber(record.masses?.gross_weight_kg),
      payloadKg: this.toPositiveNumber(record.masses?.payload_kg),
      enginePowerKw: this.toPositiveNumber(record.engine?.power_kw),
      enginePowerHp: this.toPositiveNumber(record.engine?.power_hp),
      engineTorqueNm: this.toPositiveNumber(record.engine?.max_torque_nm),
      lengthMm: this.toPositiveNumber(record.dimensions?.length_mm),
      widthMm: this.toPositiveNumber(record.dimensions?.width_mm),
      heightMm: this.toPositiveNumber(record.dimensions?.height_mm),
      wheelbaseMm: this.toPositiveNumber(record.dimensions?.wheelbase_mm),
      seats: this.toPositiveNumber(record.body?.seats),
      maxSpeedKmh: this.toPositiveNumber(
        record.transmission?.max_speed_kmh ??
          record.transmission?.max_speed_auto_kmh,
      ),
      brakedTowingKg: this.toPositiveNumber(
        record.towing?.braked_kg ?? record.towing?.braked_auto_kg,
      ),
      unbrakedTowingKg: this.toPositiveNumber(
        record.towing?.unbraked_kg ?? record.towing?.unbraked_auto_kg,
      ),
      co2CombinedGKm: this.toPositiveNumber(
        record.consumption_wltp?.co2_combined_gkm,
      ),
      fuelConsumptionCombinedL100Km: this.toPositiveNumber(
        record.consumption_wltp?.fuel_combined_l100km,
      ),
      euroStandard:
        normalizeText(record.emissions?.euro_standard_short_label) ??
        normalizeText(record.emissions?.euro_standard_short),
      color:
        normalizeText(record.body?.color_label) ??
        normalizeText(record.body?.color),
      source: 'swisscarinfo',
    };
  }

  private getVinMatchSpecificity(
    vin: string,
    record: SwissCarInfoRecord,
  ): number {
    const exactVin = normalizeText(
      record.identification?.ch_identification_number ??
        record.vehicle_identification_number,
    )?.toUpperCase();
    if (exactVin) return exactVin === vin ? vin.length : -1;

    const pattern = normalizeText(
      record.identification?.vin_prefix,
    )?.toUpperCase();
    if (!pattern || pattern.length !== vin.length) return -1;

    let specificity = 0;
    for (let index = 0; index < pattern.length; index += 1) {
      const character = pattern[index];
      if (character === '.' || character === '?' || character === '*') continue;
      if (character !== vin[index]) return -1;
      specificity += 1;
    }
    return specificity;
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
