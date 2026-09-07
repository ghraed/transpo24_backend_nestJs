import { VehicleCondition } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsIn,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateServiceRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientDraftId?: string;

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
  @IsIn(['RUNNING', 'ROLLABLE', 'NOT_ROLLABLE'])
  vehicleMobility?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(8)
  @IsIn(
    [
      'DEAD_BATTERY',
      'WINCH',
      'ACCIDENT',
      'CRANE',
      'MISSING_WHEELS',
      'NO_KEY',
      'STEERING_LOCKED',
      'BRAKES_LOCKED',
    ],
    { each: true },
  )
  vehicleIssues?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleTransmission?: string;

  @IsOptional()
  @IsEnum(VehicleCondition)
  vehicleCondition?: VehicleCondition;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  vehicleConditionNotes?: string;
}
