import {
  IsNotEmpty,
  IsString,
  IsOptional,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  nickname?: string;

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
