import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SendDriverPriceOfferDto {
  @IsNumber()
  @Min(1)
  @Max(100000)
  price!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
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
