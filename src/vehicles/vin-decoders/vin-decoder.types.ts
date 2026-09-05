export type VinDecodeProvider = 'swisscarinfo' | 'oneautoapi';

export interface NormalizedVinData {
  vin: string;
  make: string | null;
  model: string | null;
  year: string | null;
  trim: string | null;
  variant: string | null;
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
  estimatedWeightKg: number | null;
  grossWeightKg: number | null;
  payloadKg: number | null;
  enginePowerKw: number | null;
  enginePowerHp: number | null;
  engineTorqueNm: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  wheelbaseMm: number | null;
  seats: number | null;
  maxSpeedKmh: number | null;
  brakedTowingKg: number | null;
  unbrakedTowingKg: number | null;
  co2CombinedGKm: number | null;
  fuelConsumptionCombinedL100Km: number | null;
  euroStandard: string | null;
  color: string | null;
  source: VinDecodeProvider;
}

export type ProviderVinDecodeResult =
  | { kind: 'found'; data: NormalizedVinData }
  | { kind: 'not-found' };

export function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  if (
    !normalized ||
    normalized.toLowerCase() === 'null' ||
    normalized.toLowerCase() === 'not applicable'
  ) {
    return null;
  }
  return normalized;
}

export function hasUsableVehicleData(data: NormalizedVinData): boolean {
  return Boolean(
    data.make ||
    data.model ||
    data.year ||
    data.trim ||
    data.vehicleType ||
    data.bodyClass,
  );
}

export function isExplicitNotFoundMessage(value: unknown): boolean {
  const candidate =
    value && typeof value === 'object' && !Array.isArray(value)
      ? `${normalizeText(Reflect.get(value, 'code')) ?? ''} ${normalizeText(Reflect.get(value, 'message')) ?? ''}`
      : normalizeText(value);
  if (!candidate) return false;
  return /not[_ -]?found|no (?:vehicle|record|result)|aucun(?:e)? (?:véhicule|résultat)/i.test(
    candidate,
  );
}
