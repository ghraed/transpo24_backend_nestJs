import {
  IsOptional,
  IsString as IsTermsString,
  MaxLength as TermsMaxLength,
} from 'class-validator';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyPhoneCodeDto {
  @IsOptional()
  @IsTermsString()
  @TermsMaxLength(80)
  acceptedTermsVersion?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phoneNumber!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Verification code must contain six digits.' })
  code!: string;
}
