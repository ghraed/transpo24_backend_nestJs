import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class RoutePointDto {
  @IsLatitude()
  @IsNumber()
  latitude: number;

  @IsLongitude()
  @IsNumber()
  longitude: number;
}
export class RouteRequestsDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => RoutePointDto)
  coordinates: RoutePointDto[];

  @IsNumber()
  @Min(1)
  @Max(50)
  radiusKm: number;
}
