import { DriverVehicleCondition, VehicleType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { normalizeDriverVehicleTypeInput } from './driver-vehicle-type.util';

function useLegacyField(
  value: unknown,
  object: unknown,
  field: string,
): unknown {
  if (value !== undefined && value !== null) return value;
  if (object && typeof object === 'object' && field in object) {
    return (object as Record<string, unknown>)[field];
  }
  return value;
}

export class CreateDriverVehicleDto {
  @Transform(({ value }) => normalizeDriverVehicleTypeInput(value))
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @Transform(({ value, obj }) => useLegacyField(value, obj, 'make'))
  @IsString()
  @MinLength(2)
  brand!: string;

  @Transform(({ value, obj }) => useLegacyField(value, obj, 'model'))
  @IsString()
  @MinLength(1)
  model!: string;

  @IsInt()
  @Min(1980)
  @Max(new Date().getFullYear() + 1)
  year!: number;

  @Transform(({ value, obj }) => useLegacyField(value, obj, 'plateNumber'))
  @IsString()
  @IsNotEmpty()
  licensePlateNumber!: string;

  @IsEnum(DriverVehicleCondition)
  condition!: DriverVehicleCondition;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  capacityKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  lengthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  widthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  heightCm?: number;

  @IsOptional()
  @IsBoolean()
  hasTrailer?: boolean;

  @IsOptional()
  @IsDateString()
  insuranceExpiryDate?: string;

  @IsOptional()
  @IsDateString()
  registrationExpiryDate?: string;
}
