import { Transform } from 'class-transformer';
import { IsString, Matches, ValidateIf } from 'class-validator';

export class MarketContextDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_-]{1,31}$/)
  marketCode?: string;
}
