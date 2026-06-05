import { PaymentMethod } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class AcceptDriverOfferDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  stripePaymentMethodId?: string;
}
