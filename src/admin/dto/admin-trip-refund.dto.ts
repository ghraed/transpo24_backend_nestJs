import { IsNumber, IsString, Length, Min } from 'class-validator';

export class AdminTripRefundDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  expectedAmount!: number;

  @IsString()
  @Length(10, 300)
  reason!: string;
}
