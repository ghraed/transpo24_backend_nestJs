import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmCustomerDeliveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  policyVersion?: string;
}
