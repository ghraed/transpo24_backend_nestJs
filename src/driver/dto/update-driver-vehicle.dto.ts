import {
  DriverVehicleCondition,
  VehicleType,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { normalizeDriverVehicleTypeInput } from './driver-vehicle-type.util';

export class UpdateDriverVehicleDto {
  @Transform(({ value }) => normalizeDriverVehicleTypeInput(value))
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @Transform(({ value, obj }) => value ?? obj.make)
  @IsOptional()
  @IsString()
  @MinLength(2)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1980)
  @Max(new Date().getFullYear() + 1)
  year?: number;

  @Transform(({ value, obj }) => value ?? obj.plateNumber)
  @IsOptional()
  @IsString()
  @MinLength(1)
  licensePlateNumber?: string;

  @IsOptional()
  @IsEnum(DriverVehicleCondition)
  condition?: DriverVehicleCondition;

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
