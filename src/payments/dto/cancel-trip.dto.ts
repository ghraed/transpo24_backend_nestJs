import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class CancelTripDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedRetainedAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  policyVersion?: string;
}
