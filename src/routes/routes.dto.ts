import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
  IsDefined,
} from 'class-validator';

export class RoutePointDto {
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @IsNumber()
  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  placeId?: string;
}

export class ComputeDriverRouteDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => RoutePointDto)
  origin!: RoutePointDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => RoutePointDto)
  destination!: RoutePointDto;

  @IsOptional()
  @IsBoolean()
  alternatives?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/)
  @MaxLength(35)
  languageCode?: string;
}
