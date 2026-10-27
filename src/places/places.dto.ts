import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class PlaceLanguageDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  @Length(2, 35)
  languageCode?: string;
}

export class PlaceAutocompleteDto extends PlaceLanguageDto {
  @IsString()
  @Length(1, 256)
  @Matches(/\S/)
  input!: string;
}

export class PlaceDetailsDto extends PlaceLanguageDto {
  @IsString()
  @Length(1, 512)
  @Matches(/^[A-Za-z0-9_-]+$/)
  placeId!: string;
}

export class PlaceReverseDto extends PlaceLanguageDto {
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @IsNumber()
  @IsLongitude()
  longitude!: number;
}
