import { Transform } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SavePlaceDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  label!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  address!: string;

  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @IsNumber()
  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  placeId?: string;
}
