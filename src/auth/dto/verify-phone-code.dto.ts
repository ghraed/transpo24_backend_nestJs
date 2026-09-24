import { MarketContextDto } from './market-context.dto';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyPhoneCodeDto extends MarketContextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phoneNumber!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Verification code must contain six digits.' })
  code!: string;
}
