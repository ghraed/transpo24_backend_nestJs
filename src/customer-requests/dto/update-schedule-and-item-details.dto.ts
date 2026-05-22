import { ItemCondition, ItemType, VehicleCondition } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateScheduleAndItemDetailsDto {
  @IsBoolean()
  isImmediate!: boolean;

  @IsOptional()
  @IsDateString()
  scheduledPickupAt?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  itemTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  itemDescription?: string;

  @IsEnum(ItemType)
  itemType!: ItemType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  itemBrand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  itemModel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  itemYear?: number;

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

  @IsOptional()
  @IsEnum(ItemCondition)
  itemCondition?: ItemCondition;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  itemWeightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  itemLengthCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  itemWidthCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  itemHeightCm?: number;

  @IsBoolean()
  requiresLoadingHelp!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  loadingWorkersCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specialInstructions?: string;
}
