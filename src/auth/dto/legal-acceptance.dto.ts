import { IsString, MaxLength } from 'class-validator';
export class LegalAcceptanceDto {
  @IsString()
  @MaxLength(80)
  version!: string;
}
