import { GoodsHeavyShipmentType, GoodsShipmentSize } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
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

class GoodsRequestLocationDto {
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

export class CreateGoodsTransportRequestDto {
  @IsEnum(GoodsShipmentSize)
  shipmentSize!: GoodsShipmentSize;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  goodsDescription!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  approximateWeightKg!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  numberOfPieces!: number;

  @IsBoolean()
  isFragile!: boolean;

  @IsBoolean()
  requiresRefrigeration!: boolean;

  @ValidateIf(
    (value: CreateGoodsTransportRequestDto) => value.approximateWeightKg >= 50,
  )
  @IsEnum(GoodsHeavyShipmentType)
  heavyShipmentType?: GoodsHeavyShipmentType;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isImmediate?: boolean;

  @IsOptional()
  @IsDateString()
  scheduledPickupAt?: string;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => GoodsRequestLocationDto)
  pickupLocation!: GoodsRequestLocationDto;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => GoodsRequestLocationDto)
  deliveryLocation!: GoodsRequestLocationDto;
}
