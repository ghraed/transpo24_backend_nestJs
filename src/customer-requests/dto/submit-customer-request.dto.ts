import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitCustomerRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;
}
