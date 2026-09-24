import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO31661Alpha2 } from 'class-validator';
import { CoverageApprovalStatus } from '@prisma/client';
const country = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
export class CountryCoverageDto {
  @Transform(country)
  @IsISO31661Alpha2()
  countryCode!: string;
  @IsBoolean()
  canPickup!: boolean;
  @IsBoolean()
  canDropoff!: boolean;
}
export class RoutePermissionDto {
  @Transform(country)
  @IsISO31661Alpha2()
  fromCountryCode!: string;
  @Transform(country)
  @IsISO31661Alpha2()
  toCountryCode!: string;
}
export class ReviewCountryDto extends CountryCoverageDto {
  @IsEnum(CoverageApprovalStatus)
  status!: CoverageApprovalStatus;
}
export class ReviewRouteDto extends RoutePermissionDto {
  @IsEnum(CoverageApprovalStatus)
  status!: CoverageApprovalStatus;
}
