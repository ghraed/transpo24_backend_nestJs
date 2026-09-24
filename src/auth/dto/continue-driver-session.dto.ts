import { MarketContextDto } from './market-context.dto';
import { IsString, MinLength } from 'class-validator';

export class ContinueDriverSessionDto extends MarketContextDto {
  @IsString()
  @MinLength(1)
  accessToken!: string;
}
