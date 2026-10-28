import { IsOptional } from 'class-validator';
import { IsIn, IsString, MaxLength } from 'class-validator';

export class ApproveAdditionalChargeDto {
  @IsOptional()
  @IsString()
  policyVersion?: string;
  @IsString()
  @MaxLength(16)
  confirmationLocale!: string;

  @IsString()
  @MaxLength(64)
  confirmationText!: string;

  @IsString()
  @IsIn(['SAVED_CARD', 'CASH_ON_DELIVERY'])
  paymentOption!: 'SAVED_CARD' | 'CASH_ON_DELIVERY';
}
