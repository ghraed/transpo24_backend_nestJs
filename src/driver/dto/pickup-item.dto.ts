import {
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class PickupItemDto {
  @ValidateIf((dto: PickupItemDto) => dto.longitude !== undefined)
  @IsDefined()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((dto: PickupItemDto) => dto.latitude !== undefined)
  @IsDefined()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsUrl()
  proofImageUrl?: string;
}

export class DriverTripParamDto {
  @IsString()
  @IsNotEmpty()
  tripId!: string;
}
