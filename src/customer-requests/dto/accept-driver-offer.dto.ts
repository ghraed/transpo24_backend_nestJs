import { IsBoolean, IsOptional } from 'class-validator';

export class AcceptDriverOfferDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
