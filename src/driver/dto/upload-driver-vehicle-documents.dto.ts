import { IsDateString, IsOptional } from 'class-validator';

export class UploadDriverVehicleDocumentsDto {
  @IsOptional()
  @IsDateString()
  insuranceExpiryDate?: string;

  @IsOptional()
  @IsDateString()
  registrationExpiryDate?: string;
}
