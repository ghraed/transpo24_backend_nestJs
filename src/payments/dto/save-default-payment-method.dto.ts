import { IsString } from 'class-validator';

export class SaveDefaultPaymentMethodDto {
  @IsString()
  stripePaymentMethodId!: string;
}
