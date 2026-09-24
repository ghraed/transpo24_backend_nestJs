import { MarketContextDto } from './market-context.dto';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto extends MarketContextDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
