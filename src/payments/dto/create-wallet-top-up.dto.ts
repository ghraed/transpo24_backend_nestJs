import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

const SUPPORTED_TOP_UP_PAYMENT_METHODS = [
  PaymentMethod.CREDIT_CARD,
  PaymentMethod.DEBIT_CARD,
  PaymentMethod.APPLE_PAY,
  PaymentMethod.GOOGLE_PAY,
] as const;

export class CreateWalletTopUpDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  currency!: string;

  @IsString()
  @IsIn(SUPPORTED_TOP_UP_PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;
}
