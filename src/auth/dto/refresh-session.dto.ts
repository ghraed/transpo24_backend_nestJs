import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}
