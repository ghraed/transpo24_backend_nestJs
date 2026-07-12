import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewDriverRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
