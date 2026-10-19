import { DriverBusinessDto } from './driver-business.dto';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertDriverPersonalInfoDto extends DriverBusinessDto {
  @IsString()
  @IsNotEmpty()
  fullNameOnId!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsString()
  @IsNotEmpty()
  idOrResidencyNumber!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  coverageCity?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  coverageAreas?: string[];
}
