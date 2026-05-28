import {
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class StartDeliveryDto {}

export class DeliverItemDto {
  @ValidateIf((dto: DeliverItemDto) => dto.longitude !== undefined)
  @IsDefined()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((dto: DeliverItemDto) => dto.latitude !== undefined)
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
