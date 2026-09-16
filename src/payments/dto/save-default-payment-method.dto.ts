import { IsString, Matches, MaxLength } from 'class-validator';

export class SaveDefaultPaymentMethodDto {
  @IsString()
  @Matches(/^pm_[a-zA-Z0-9]+$/)
  @MaxLength(255)
  stripePaymentMethodId!: string;
}
