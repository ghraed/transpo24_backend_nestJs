import { MotorcycleCondition, MotorcycleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmptyObject,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class MotorcycleRequestLocationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  placeId?: string;
}

export class CreateMotorcycleTransportRequestDto {
  @IsEnum(MotorcycleType)
  motorcycleType!: MotorcycleType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  chassisNumber?: string;

  @IsEnum(MotorcycleCondition)
  motorcycleCondition!: MotorcycleCondition;

  @IsBoolean()
  requiresSpecialWrapping!: boolean;

  @IsBoolean()
  requiresDedicatedCarrier!: boolean;

  @IsOptional()
  @IsBoolean()
  isImmediate?: boolean;

  @IsOptional()
  @IsDateString()
  scheduledPickupAt?: string;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => MotorcycleRequestLocationDto)
  pickupLocation!: MotorcycleRequestLocationDto;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => MotorcycleRequestLocationDto)
  deliveryLocation!: MotorcycleRequestLocationDto;
}
