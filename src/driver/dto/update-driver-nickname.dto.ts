import { IsNotEmpty, IsString, Length } from 'class-validator';

export class UpdateDriverNicknameDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 40)
  nickname!: string;
}
