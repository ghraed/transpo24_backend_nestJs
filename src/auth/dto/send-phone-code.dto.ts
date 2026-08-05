import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendPhoneCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phoneNumber!: string;
}
