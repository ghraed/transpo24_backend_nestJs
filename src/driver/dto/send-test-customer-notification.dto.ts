import { IsEmail, IsString, MaxLength } from 'class-validator';

export class SendTestCustomerNotificationDto {
  @IsEmail()
  @IsString()
  @MaxLength(255)
  email!: string;
}
