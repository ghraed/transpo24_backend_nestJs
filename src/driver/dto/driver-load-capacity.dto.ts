import { DayOfWeek, VehicleCargoType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class WorkingTimeRangeDto {
  @IsString()
  @Matches(TIME_24H_REGEX, { message: 'startTime must be in HH:mm format.' })
  startTime!: string;

  @IsString()
  @Matches(TIME_24H_REGEX, { message: 'endTime must be in HH:mm format.' })
  endTime!: string;
}

export class WorkingDayScheduleDto {
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsBoolean()
  isAvailable!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingTimeRangeDto)
  timeRanges!: WorkingTimeRangeDto[];
}

export class UpsertDriverVehicleLoadCapacityDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  maxLoadKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  cargoLengthM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  cargoWidthM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  cargoHeightM?: number;

  @IsOptional()
  @IsBoolean()
  dimensionsAreStandard?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(VehicleCargoType, { each: true })
  allowedCargoTypes!: VehicleCargoType[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkingDayScheduleDto)
  workingSchedule!: WorkingDayScheduleDto[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export interface WorkingTimeRangeResponseDto {
  startTime: string;
  endTime: string;
}

export interface WorkingDayScheduleResponseDto {
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  timeRanges: WorkingTimeRangeResponseDto[];
}

export interface DriverVehicleLoadCapacityResponseDto {
  id: string;
  driverId: string;
  vehicleId: string;
  name: string | null;
  vehicleType: string;
  maxLoadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  dimensionsAreStandard: boolean;
  allowedCargoTypes: VehicleCargoType[];
  workingSchedule: WorkingDayScheduleResponseDto[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverVehicleLoadCapacitiesListResponseDto {
  loadCapacities: DriverVehicleLoadCapacityResponseDto[];
}
