import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAdminUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
