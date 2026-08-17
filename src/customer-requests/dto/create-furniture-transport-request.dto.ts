import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return value as boolean | undefined;
}

function toObject(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function toFurnitureLocation(value: unknown): unknown {
  const parsed = toObject(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return parsed;
  }

  return plainToInstance(FurnitureRequestLocationDto, parsed);
}

class FurnitureRequestLocationDto {
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

export class CreateFurnitureTransportRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  furnitureDescription!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  approximateItemCount!: number;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  needsHelpers?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isImmediate?: boolean;

  @IsOptional()
  @IsDateString()
  scheduledPickupAt?: string;

  @IsDateString()
  movingDate!: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  customerCanHelpLoading?: boolean;

  @Transform(({ value }) => toFurnitureLocation(value))
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => FurnitureRequestLocationDto)
  pickupLocation!: FurnitureRequestLocationDto;

  @Transform(({ value }) => toFurnitureLocation(value))
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => FurnitureRequestLocationDto)
  deliveryLocation!: FurnitureRequestLocationDto;
}
