import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DriverBusinessDto {
  @IsIn(['PERSONAL', 'COMPANY'])
  driverType!: 'PERSONAL' | 'COMPANY';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  trn?: string;

  @IsOptional()
  @IsString()
  nickname?: string;
}
