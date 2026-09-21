import {
  GoodsShipmentSize,
  GoodsHeavyShipmentType,
  MotorcycleType,
  MotorcycleCondition,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  IsDefined,
} from 'class-validator';
import { UpdateScheduleAndItemDetailsDto } from './update-schedule-and-item-details.dto';
import { UpdatePickupLocationDto } from './update-pickup-location.dto';

export class EditCustomerRequestDto extends UpdateScheduleAndItemDetailsDto {
  @IsOptional()
  @IsInt()
  declare itemYear?: number;

  @IsOptional()
  @IsInt()
  declare vehicleManufactureYear?: number;

  @IsOptional()
  @IsInt()
  declare loadingWorkersCount?: number;

  @IsDateString()
  updatedAt!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => UpdatePickupLocationDto)
  pickupLocation!: UpdatePickupLocationDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => UpdatePickupLocationDto)
  dropoffLocation!: UpdatePickupLocationDto;

  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  retainedPhotoIds!: string[];

  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;

  @IsOptional()
  @IsEnum(MotorcycleType)
  motorcycleType?: MotorcycleType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  motorcycleChassisNumber?: string;

  @IsOptional()
  @IsEnum(MotorcycleCondition)
  motorcycleCondition?: MotorcycleCondition;

  @IsOptional()
  @IsEnum(GoodsShipmentSize)
  goodsShipmentSize?: GoodsShipmentSize;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  goodsDescription?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  goodsApproximateWeightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  goodsNumberOfPieces?: number;

  @IsOptional()
  @IsEnum(GoodsHeavyShipmentType)
  goodsHeavyShipmentType?: GoodsHeavyShipmentType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  furnitureDescription?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  furnitureApproximateItemCount?: number;

  @IsBoolean()
  requiresSpecialWrapping!: boolean;

  @IsBoolean()
  requiresDedicatedCarrier!: boolean;

  @IsBoolean()
  goodsIsFragile!: boolean;

  @IsBoolean()
  goodsRequiresRefrigeration!: boolean;

  @IsBoolean()
  furnitureNeedsHelpers!: boolean;

  @IsBoolean()
  furnitureCustomerCanHelpLoading!: boolean;
}

// Only customer-authored fields may be returned or written by the edit endpoint.
export { EDITABLE_REQUEST_FIELDS } from '../editable-request-fields';
