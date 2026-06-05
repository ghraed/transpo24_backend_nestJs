import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdditionalChargeDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  equipmentType?: string;
}
