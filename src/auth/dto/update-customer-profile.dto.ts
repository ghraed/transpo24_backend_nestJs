import { IsNotEmpty, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class UpdateCustomerProfileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  countryCode!: string;
}
