import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PlaceLanguageDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  @Length(2, 35)
  languageCode?: string;
}

export class PlaceLocationDto {
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @IsNumber()
  @IsLongitude()
  longitude!: number;
}

export class PlaceAutocompleteDto extends PlaceLanguageDto {
  @IsString()
  @Length(1, 256)
  @Matches(/\S/)
  input!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlaceLocationDto)
  location?: PlaceLocationDto;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,36}$/)
  sessionToken?: string;
}

export class PlaceDetailsDto extends PlaceLanguageDto {
  @IsString()
  @Length(1, 512)
  @Matches(/^[A-Za-z0-9_-]+$/)
  placeId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,36}$/)
  sessionToken?: string;
}

export class PlaceCountryDto {
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode!: string;
}

export class PlaceReverseDto extends PlaceLanguageDto {
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @IsNumber()
  @IsLongitude()
  longitude!: number;
}
