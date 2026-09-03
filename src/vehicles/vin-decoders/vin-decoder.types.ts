export type VinDecodeProvider = 'swisscarinfo' | 'oneautoapi';

export interface NormalizedVinData {
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
  estimatedWeightKg: number | null;
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
