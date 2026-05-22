import { IsNotEmpty, IsString } from 'class-validator';

export class VehicleModelsQueryDto {
  @IsString()
  @IsNotEmpty()
  brandId!: string;
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
