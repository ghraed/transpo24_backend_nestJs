import { DayOfWeek } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class DriverAvailabilityDayDto {
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsBoolean()
  isAvailable!: boolean;

  @IsOptional()
  @IsString()
  @Matches(TIME_24H_REGEX, { message: 'startTime must be in HH:mm format.' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_24H_REGEX, { message: 'endTime must be in HH:mm format.' })
  endTime?: string;
}

export class DriverCityCoverageDto {
  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export class UpdateDriverMatchingLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsNumber()
  @Min(0)
  recordedAt!: number;
}

export class UpdateDriverAvailabilityDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DriverCityCoverageDto)
  cityCoverage?: DriverCityCoverageDto[];

  @IsString()
  @IsNotEmpty()
  timezone!: string;

  @IsBoolean()
  isOnline!: boolean;

  @IsNumber()
  @Min(1)
  @Max(500)
  serviceRadiusKm!: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  baseLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  baseLongitude?: number;

  @IsOptional()
  @IsString()
  baseAddress?: string;

  @IsBoolean()
  acceptsImmediateRequests!: boolean;

  @IsBoolean()
  acceptsScheduledRequests!: boolean;

  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => DriverAvailabilityDayDto)
  weeklySchedule!: DriverAvailabilityDayDto[];
}

export class UpdateDriverOnlineStatusDto {
  @IsBoolean()
  isOnline!: boolean;
}
