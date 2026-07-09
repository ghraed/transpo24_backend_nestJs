import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatJoinRoomDto {
  @IsString()
  roomId!: string;
}

export class ChatLeaveRoomDto {
  @IsString()
  roomId!: string;
}

export class ChatSendMessageSocketDto {
  @IsString()
  roomId!: string;

  @IsString()
  @MaxLength(4000)
  body!: string;
}

export class ChatTypingDto {
  @IsString()
  roomId!: string;

  @IsOptional()
  @IsBoolean()
  isTyping?: boolean = true;
}
