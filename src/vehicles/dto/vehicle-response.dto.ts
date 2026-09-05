export class VehicleCatalogBrandDto {
  id!: string;
  name!: string;
  slug!: string;
}

export class VehicleCatalogModelDto {
  id!: string;
  brandId!: string;
  name!: string;
  slug!: string;
  bodyType!: string | null;
}

export class VehicleCatalogSeriesDto {
  id!: string;
  modelId!: string;
  name!: string;
  slug!: string;
  variantName!: string | null;
  yearFrom!: number | null;
  yearTo!: number | null;
  estimatedWeightKg!: number | null;
  bodyType!: string | null;
}

export class VehicleCatalogYearDto {
  year!: number;
}

export class VehicleVinDecodeDataDto {
  vin!: string;
  brand!: string | null;
  model!: string | null;
  series!: string | null;
  variant!: string | null;
  manufactureYear!: number | null;
  estimatedWeightKg!: number | null;
  bodyType!: string | null;
  make?: string | null;
  year?: string | null;
  trim?: string | null;
  variantCode?: string | null;
  vehicleType?: string | null;
  bodyClass?: string | null;
  manufacturer?: string | null;
  plantCountry?: string | null;
  engineCylinders?: string | null;
  displacementL?: string | null;
  fuelTypePrimary?: string | null;
  transmissionStyle?: string | null;
  driveType?: string | null;
  doors?: string | null;
  grossWeightKg?: number | null;
  payloadKg?: number | null;
  enginePowerKw?: number | null;
  enginePowerHp?: number | null;
  engineTorqueNm?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  wheelbaseMm?: number | null;
  seats?: number | null;
  maxSpeedKmh?: number | null;
  brakedTowingKg?: number | null;
  unbrakedTowingKg?: number | null;
  co2CombinedGKm?: number | null;
  fuelConsumptionCombinedL100Km?: number | null;
  euroStandard?: string | null;
  color?: string | null;
  errorCode?: string | null;
  errorText?: string | null;
  source?: 'swisscarinfo' | 'oneautoapi';
}

export class VehicleVinDecodeResponseDto {
  success!: boolean;
  source!: 'VIN_API';
  requiresManualSelection!: boolean;
  message?: string;
  data!: VehicleVinDecodeDataDto | null;
}
