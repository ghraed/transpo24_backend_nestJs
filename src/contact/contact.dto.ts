import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;

  // Hidden form field: reject automated submissions without exposing an error.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
