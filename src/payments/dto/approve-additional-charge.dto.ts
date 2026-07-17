import { IsString, MaxLength } from 'class-validator';

export class ApproveAdditionalChargeDto {
  @IsString()
  @MaxLength(16)
  confirmationLocale!: string;

  @IsString()
  @MaxLength(64)
  confirmationText!: string;
}
