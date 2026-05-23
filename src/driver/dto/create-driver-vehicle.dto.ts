import { VehicleType } from '@prisma/client';
import {
  IsBoolean,
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

export class CreateDriverVehicleDto {
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @IsString()
  @MinLength(2)
  make!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsInt()
  @Min(1980)
  @Max(new Date().getFullYear() + 1)
  year!: number;

  @IsString()
  @IsNotEmpty()
  plateNumber!: string;

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

  @IsBoolean()
  hasTrailer!: boolean;
}
