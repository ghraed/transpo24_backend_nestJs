import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class WebPushSubscriptionKeysDto {
  @IsString()
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @MaxLength(512)
  auth!: string;
}

export class CreateWebPushSubscriptionDto {
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @MaxLength(2048)
  endpoint!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => WebPushSubscriptionKeysDto)
  keys!: WebPushSubscriptionKeysDto;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}
