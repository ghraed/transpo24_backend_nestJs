import { IsString, IsUrl, MaxLength } from 'class-validator';

export class DeleteWebPushSubscriptionDto {
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @IsString()
  @MaxLength(2048)
  endpoint!: string;
}
