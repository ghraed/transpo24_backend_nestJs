import { Length } from 'class-validator';
import { IsString, MaxLength } from 'class-validator';

export class SendChatMessageDto {
  @IsString()
  @Length(16, 100)
  operationId!: string;

  @IsString()
  @MaxLength(4000)
  body!: string;
}
