import { VehicleCondition } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateServiceRequestDto {
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehicleVin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleBrand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleSeries?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleVariant?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  vehicleManufactureYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  vehicleEstimatedWeightKg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleBodyType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicleDataSource?: string;

  @IsOptional()
  @IsEnum(VehicleCondition)
  vehicleCondition?: VehicleCondition;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  vehicleConditionNotes?: string;
}
