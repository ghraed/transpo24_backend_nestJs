import { IsString, MinLength } from 'class-validator';

export class ContinueDriverSessionDto {
  @IsString()
  @MinLength(1)
  accessToken!: string;
}
