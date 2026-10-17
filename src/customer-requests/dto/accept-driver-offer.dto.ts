import { PaymentMethod } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class AcceptDriverOfferDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsBoolean()
  supportsDeferredFurniture?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsDeferredVehicle?: boolean;

  @IsOptional()
  @IsString()
  stripePaymentMethodId?: string;
}
