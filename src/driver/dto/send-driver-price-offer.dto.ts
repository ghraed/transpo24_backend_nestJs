import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SendDriverPriceOfferDto {
  @IsNumber()
  @Min(1)
  @Max(100000)
  price!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency!: string;

  @IsOptional()
  @IsDateString()
  estimatedPickupAt?: string;

  @IsOptional()
  @IsDateString()
  estimatedDeliveryAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  estimatedDurationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
