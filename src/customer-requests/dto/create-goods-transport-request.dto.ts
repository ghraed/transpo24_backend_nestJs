import { GoodsHeavyShipmentType, GoodsShipmentSize } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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

  @ValidateIf((value: CreateGoodsTransportRequestDto) => value.approximateWeightKg >= 50)
  @IsEnum(GoodsHeavyShipmentType)
  heavyShipmentType?: GoodsHeavyShipmentType;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => GoodsRequestLocationDto)
  pickupLocation!: GoodsRequestLocationDto;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => GoodsRequestLocationDto)
  deliveryLocation!: GoodsRequestLocationDto;
}
