import { IsString, MaxLength } from 'class-validator';

export class SendChatMessageDto {
  @IsString()
  @MaxLength(4000)
  body!: string;
}
