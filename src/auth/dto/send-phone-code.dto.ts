import { MarketContextDto } from './market-context.dto';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendPhoneCodeDto extends MarketContextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phoneNumber!: string;
}
