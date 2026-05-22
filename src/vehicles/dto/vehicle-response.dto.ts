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
}

export class VehicleVinDecodeResponseDto {
  success!: boolean;
  source!: 'VIN_API';
  requiresManualSelection!: boolean;
  message?: string;
  data!: VehicleVinDecodeDataDto | null;
}
