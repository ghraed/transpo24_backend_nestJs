import {
  IsOptional,
  IsString as IsTermsString,
  MaxLength as TermsMaxLength,
} from 'class-validator';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsTermsString()
  @TermsMaxLength(80)
  acceptedTermsVersion?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
