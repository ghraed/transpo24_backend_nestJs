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
  errorCode?: string | null;
  errorText?: string | null;
  source?: 'NHTSA_VPIC';
}

export class VehicleVinDecodeResponseDto {
  success!: boolean;
  source!: 'VIN_API' | 'NHTSA_VPIC';
  requiresManualSelection!: boolean;
  message?: string;
  data!: VehicleVinDecodeDataDto | null;
}
