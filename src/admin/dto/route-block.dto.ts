import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ServiceKey } from '@prisma/client';

const country = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateRouteBlockDto {
  @Transform(country)
  @IsISO31661Alpha2()
  fromCountryCode!: string;

  @Transform(country)
  @IsISO31661Alpha2()
  toCountryCode!: string;

  @IsOptional()
  @IsEnum(ServiceKey)
  transportType?: ServiceKey | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRouteBlockDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(country)
  @IsISO31661Alpha2()
  fromCountryCode?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(country)
  @IsISO31661Alpha2()
  toCountryCode?: string;

  @IsOptional()
  @IsEnum(ServiceKey)
  transportType?: ServiceKey | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class RouteBlocksQueryDto {
  @IsOptional()
  @Transform(country)
  @IsISO31661Alpha2()
  fromCountryCode?: string;

  @IsOptional()
  @Transform(country)
  @IsISO31661Alpha2()
  toCountryCode?: string;

  @IsOptional()
  @IsEnum(ServiceKey)
  transportType?: ServiceKey;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class RouteCheckQueryDto {
  @Transform(country)
  @IsISO31661Alpha2()
  from!: string;

  @Transform(country)
  @IsISO31661Alpha2()
  to!: string;

  @IsEnum(ServiceKey)
  type!: ServiceKey;
}
