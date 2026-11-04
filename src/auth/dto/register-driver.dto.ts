import {
  IsString as IsTermsString,
  MaxLength as TermsMaxLength,
} from 'class-validator';
import { DriverBusinessDto } from '../../driver/dto/driver-business.dto';
import {
  ArrayUnique,
  IsEmail,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDriverDto extends DriverBusinessDto {
  @IsOptional()
  @IsTermsString()
  @TermsMaxLength(80)
  acceptedTermsVersion?: string;

  @IsOptional()
  @IsString()
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  countryCodes?: string[];

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  cities?: string[];
}
