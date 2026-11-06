import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class VehicleModelsQueryDto {
  @IsString()
  @IsNotEmpty()
  brandId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class VehicleSeriesQueryDto {
  @IsString()
  @IsNotEmpty()
  modelId!: string;
}

export class VehicleYearsQueryDto {
  @IsString()
  @IsNotEmpty()
  seriesId!: string;
}
